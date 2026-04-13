import type { Block, OnError, Scenario, Step, Track } from '../types';
import type {
  BlockStatus,
  ExecutionState,
  LogEntry,
} from './types';
import type { NodeCall, NodeContext, Runtime } from './runtime';
import { evalBool, evalJsonLogic } from './jsonLogic';

export interface ExecutionHooks {
  onStateChange(state: ExecutionState): void;
}

/**
 * Options for partial execution.
 * - ``singleBlockId`` — run only this block (within its track).
 * - ``startStepId`` — within the target block, skip steps before
 *   this one and start from here.
 * - ``singleStepId`` — run only this one step (implies the
 *   containing block).
 */
export interface ExecutionOptions {
  singleBlockId?: string;
  startStepId?: string;
  singleStepId?: string;
}

/**
 * Waiter used by `waitForBlocks`. `deps` hold the block ids to await;
 * `resolve` is called once all of them have reached a terminal status
 * (`ok` / `skipped` / `error` / `cancelled`).
 */
interface Waiter {
  deps: string[];
  resolve: () => void;
}

const TERMINAL: readonly BlockStatus[] = [
  'ok',
  'skipped',
  'error',
  'cancelled',
] as const;

function isTerminal(status: BlockStatus | undefined): boolean {
  return status !== undefined && TERMINAL.includes(status);
}

/**
 * FLOWLINE execution engine (Phase 1, in-process).
 *
 * Responsibilities:
 * 1. Walk each track in parallel, respecting block order by slot.
 * 2. Wait for sync points before running a block.
 * 3. Delegate the actual "run" to a `Runtime` (the `MockRuntime` today,
 *    a real Python worker later).
 * 4. Apply per-block `onError` (abort / skip / ignore / retry(n)).
 * 5. Escalate unhandled errors via `abort`, cancelling every running
 *    track and then running the scenario error handler track.
 * 6. Expand `subroutine` blocks inline, reusing the same executor loop so
 *    sub-blocks get the same status/logging treatment.
 *
 * Implementation notes:
 * - The `state` object is mutated in place. `flush()` emits a shallow
 *   clone through the hook so React can diff it.
 * - Waiters park on a simple list, re-checked whenever `flush()` runs.
 *   This keeps the model synchronous-reasoning-friendly without a full
 *   event loop.
 */
export class Executor {
  private state: ExecutionState;
  private scenario: Scenario;
  private runtime: Runtime;
  private hooks: ExecutionHooks;
  private aborted = false;
  private waiters: Waiter[] = [];
  private logId = 0;
  /** Slot at which the error that caused abort occurred (for slot-aware cleanup). */
  private errorSlot: number | null = null;
  /**
   * Mutable variable store for the run. Seeded from
   * `scenario.variables.scenario` so authors can set initial values in
   * the JSON; updates from out-ports and future built-in nodes land
   * here. Keys are flat dotted paths like `"scenario.target"` or
   * `"track.t-main.loop_index"` — scope is encoded in the prefix so
   * the store itself stays a single Map. Runtimes read/write through
   * the `NodeContext.getVariable` / `setVariable` helpers.
   */
  private variables: Map<string, unknown>;

  /**
   * In-memory channel store for block-to-block connections.
   * Key format: `${blockId}::${portName}`.
   * When a block writes an output port, its value lands here. Downstream
   * blocks with `{ kind: 'connection', fromBlockId, fromPort }` inputs
   * read from this store when they execute.
   */
  private channels: Map<string, unknown> = new Map();

  private options: ExecutionOptions;

  constructor(
    scenario: Scenario,
    runtime: Runtime,
    hooks: ExecutionHooks,
    options: ExecutionOptions = {},
  ) {
    this.scenario = scenario;
    this.runtime = runtime;
    this.hooks = hooks;
    this.options = options;
    this.state = {
      running: true,
      phase: 'running',
      status: {},
      currentSlot: {},
      logs: [],
      variables: {},
    };
    this.variables = new Map<string, unknown>();
    for (const [key, value] of Object.entries(scenario.variables.scenario)) {
      this.variables.set(`scenario.${key}`, value);
    }
  }

  async run(): Promise<void> {
    const { singleBlockId, startStepId, singleStepId } = this.options;
    const isPartial = !!(singleBlockId || singleStepId);

    // Reset the channel store for this run.
    this.channels.clear();

    // Initialize every block's status to idle so the UI can distinguish
    // "not yet executed" from "absent".
    for (const t of this.scenario.tracks) {
      for (const b of t.blocks) {
        this.state.status[b.id] = 'idle';
        for (const s of b.steps) this.state.status[s.id] = 'idle';
      }
    }
    for (const b of this.scenario.errorHandler.blocks) {
      this.state.status[b.id] = 'idle';
      for (const s of b.steps) this.state.status[s.id] = 'idle';
    }
    for (const sub of this.scenario.subroutines) {
      for (const b of sub.blocks) {
        this.state.status[b.id] = 'idle';
        for (const s of b.steps) this.state.status[s.id] = 'idle';
      }
    }

    if (isPartial) {
      this.log('info', undefined, undefined, '部分実行開始');
    } else {
      this.log('info', undefined, undefined, 'シナリオ実行開始');
    }
    this.flush();

    try {
      if (isPartial) {
        await this.runPartial();
      } else {
        await Promise.all(
          this.scenario.tracks.map((t) => this.runTrack(t)),
        );
      }
    } catch (err) {
      this.log(
        'error',
        undefined,
        undefined,
        `エンジン内部エラー: ${String(err)}`,
      );
    }

    if (this.aborted) {
      if (!isPartial) {
        this.state.phase = 'error-handler';
        this.flush();
        if (this.scenario.errorHandler.blocks.length > 0) {
          this.log('warn', undefined, undefined, 'エラー処理トラック実行');
          await this.runErrorHandler(this.scenario.errorHandler);
        }
      }
      this.state.phase = 'aborted';
      this.log('warn', undefined, undefined, isPartial ? '部分実行中止' : 'シナリオ中止');
    } else {
      this.state.phase = 'done';
      this.log('info', undefined, undefined, isPartial ? '部分実行完了' : 'シナリオ完了');
    }

    this.state.running = false;
    this.state.currentSlot = {};
    this.flush();
  }

  /**
   * Run a subset of the scenario (single block, single step, or
   * from-step). Resolves the target block/track and delegates.
   */
  private async runPartial(): Promise<void> {
    const { singleBlockId, startStepId, singleStepId } = this.options;
    const targetBlockId = singleBlockId ?? this.findBlockForStep(singleStepId ?? startStepId ?? '');

    if (!targetBlockId) {
      this.log('error', undefined, undefined, '対象ブロックが見つかりません');
      return;
    }

    // Find block + its track
    let targetTrack: Track | undefined;
    let targetBlock: Block | undefined;
    for (const t of this.scenario.tracks) {
      const b = t.blocks.find((bl) => bl.id === targetBlockId);
      if (b) {
        targetTrack = t;
        targetBlock = b;
        break;
      }
    }
    if (!targetTrack || !targetBlock) {
      this.log('error', undefined, undefined, '対象ブロックが見つかりません');
      return;
    }

    this.state.currentSlot[targetTrack.id] = targetBlock.slot;

    if (singleStepId) {
      // Run a single step only
      const step = targetBlock.steps.find((s) => s.id === singleStepId);
      if (!step) {
        this.log('error', undefined, undefined, '対象ステップが見つかりません');
        return;
      }
      this.state.status[targetBlock.id] = 'running';
      this.log(
        'info',
        targetTrack.id,
        targetBlock.id,
        `ステップ「${step.label}」を単体実行`,
        step.id,
      );
      this.flush();
      await this.executeStepOrGroup(
        targetTrack.id,
        targetBlock,
        step,
        { isErrorHandler: false },
      );
      this.state.status[targetBlock.id] =
        this.state.status[step.id] === 'error' ? 'error' : 'ok';
      this.flush();
    } else {
      // Run the block, possibly from a specific step
      if (startStepId) {
        await this.executeTaskFrom(
          targetTrack.id,
          targetBlock,
          startStepId,
          { isErrorHandler: false },
        );
      } else {
        await this.executeTask(
          targetTrack.id,
          targetBlock,
          { isErrorHandler: false },
        );
      }
    }

    delete this.state.currentSlot[targetTrack.id];
    this.flush();
  }

  /** Resolve a stepId to its containing blockId. */
  private findBlockForStep(stepId: string): string | undefined {
    for (const t of this.scenario.tracks) {
      for (const b of t.blocks) {
        if (b.steps.some((s) => s.id === stepId)) return b.id;
      }
    }
    return undefined;
  }

  /**
   * Execute a block's flowchart starting from a specific step,
   * skipping earlier steps.
   */
  private async executeTaskFrom(
    containerId: string,
    block: Block,
    startStepId: string,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    this.state.status[block.id] = 'running';
    this.log('info', containerId, block.id, `タスク「${block.label}」開始 (途中から)`);
    this.flush();

    for (const step of block.steps) {
      this.state.status[step.id] = 'idle';
    }
    this.flush();

    const topLevel = block.steps
      .filter((s) => !s.parentStepId && s.inFlow !== false)
      .sort((a, b) => a.order - b.order);

    // Find start index
    const startIdx = topLevel.findIndex((s) => s.id === startStepId);
    const stepsToRun = startIdx >= 0 ? topLevel.slice(startIdx) : topLevel;

    // Mark skipped steps
    for (let i = 0; i < startIdx && i < topLevel.length; i++) {
      this.state.status[topLevel[i].id] = 'skipped';
    }
    this.flush();

    let failed = false;
    for (const step of stepsToRun) {
      if (this.aborted) {
        this.markCancelled(step.id);
        continue;
      }
      await this.executeStepOrGroup(containerId, block, step, opts);
      if (this.state.status[step.id] === 'error') {
        failed = true;
        break;
      }
    }

    if (this.aborted) {
      this.state.status[block.id] = 'cancelled';
    } else if (failed) {
      this.state.status[block.id] = 'error';
    } else {
      this.state.status[block.id] = 'ok';
      this.log('info', containerId, block.id, `タスク「${block.label}」完了`);
    }
    this.flush();
  }

  /**
   * Request abort. Resolves every waiter so parked tracks unblock and
   * tear down, then cascades through subsequent block executions which
   * short-circuit to `cancelled`.
   */
  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    const pending = this.waiters;
    this.waiters = [];
    for (const w of pending) w.resolve();
  }

  // ────────────────────────────────────────────────────────────────────
  // Track / block driving
  // ────────────────────────────────────────────────────────────────────

  private async runTrack(track: Track): Promise<void> {
    // All blocks drive the outer loop; each block's steps execute inside executeTask.
    const topLevel = track.blocks.slice().sort((a, b) => a.slot - b.slot);
    const crossedSyncSlots = new Set<number>();

    for (const block of topLevel) {
      if (this.aborted) {
        this.markCancelled(block.id);
        // Also cancel any steps that were initialised.
        for (const step of block.steps) this.markCancelled(step.id);
        continue;
      }

      // Cross any sync points whose slot is at or before this block and
      // that haven't been crossed yet by this track.
      const syncsToCross = this.scenario.syncPoints
        .filter(
          (sp) =>
            sp.slot <= block.slot &&
            !crossedSyncSlots.has(sp.slot),
        )
        .sort((a, b) => a.slot - b.slot);
      for (const sp of syncsToCross) {
        if (this.aborted) break;
        this.log('info', track.id, undefined, `同期ポイント #${sp.slot} 待機`);
        // Wait for ALL blocks across ALL tracks whose slot < sp.slot.
        const priorBlockIds: string[] = [];
        for (const t of this.scenario.tracks) {
          for (const b of t.blocks) {
            if (b.slot < sp.slot) priorBlockIds.push(b.id);
          }
        }
        await this.waitForBlocks(priorBlockIds);
        crossedSyncSlots.add(sp.slot);
      }

      if (this.aborted) {
        this.markCancelled(block.id);
        continue;
      }

      // Wait for any blocks this block depends on via connection inputs.
      // This enforces explicit data-flow ordering across tracks without
      // needing a sync point.
      const dependencyIds = this.collectConnectionDeps(block);
      if (dependencyIds.length > 0) {
        this.log(
          'info',
          track.id,
          block.id,
          `データ依存待機: ${dependencyIds.length} 件`,
        );
        await this.waitForBlocks(dependencyIds);
        if (this.aborted) {
          this.markCancelled(block.id);
          continue;
        }
      }

      this.state.currentSlot[track.id] = block.slot;
      await this.executeBlockOrGroup(track.id, track.blocks, block, {
        isErrorHandler: false,
      });
    }
    // Clear the per-track playhead once the track drains.
    delete this.state.currentSlot[track.id];
    this.flush();
  }

  /**
   * Collect block IDs this block depends on via `connection` input bindings.
   * The block can't run until all of these have reached a terminal state.
   */
  private collectConnectionDeps(block: Block): string[] {
    if (!block.inputs) return [];
    const ids = new Set<string>();
    for (const binding of Object.values(block.inputs)) {
      if (binding.kind === 'connection') {
        ids.add(binding.fromBlockId);
      }
    }
    return [...ids];
  }

  /**
   * Run a block. In the new model every block has steps, so this
   * always delegates to executeTask.
   */
  private async executeBlockOrGroup(
    containerId: string,
    _trackBlocks: Block[],
    block: Block,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    await this.executeTask(containerId, block, opts);
  }

  // ────────────────────────────────────────────────────────────────────
  // Step-based execution (new model)
  // ────────────────────────────────────────────────────────────────────

  /**
   * Execute the internal flowchart of a task block (block.steps).
   * Top-level steps run in order; control-flow steps recurse.
   */
  private async executeTask(
    containerId: string,
    block: Block,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    this.state.status[block.id] = 'running';
    this.log('info', containerId, block.id, `タスク「${block.label}」開始`);
    this.flush();

    // START node: resolve block inputs from their bindings.
    // Three binding kinds:
    //   - var:        read from scenario variable
    //   - literal:    use the hardcoded value
    //   - connection: read from another block's output channel
    if (block.inputs) {
      for (const [localName, binding] of Object.entries(block.inputs)) {
        let value: unknown;
        let source = '';
        if (binding.kind === 'var') {
          value = this.variables.get(binding.key);
          source = binding.key;
        } else if (binding.kind === 'literal') {
          value = binding.value;
          source = `literal`;
        } else if (binding.kind === 'connection') {
          value = this.channels.get(
            `${binding.fromBlockId}::${binding.fromPort}`,
          );
          source = `${binding.fromBlockId}.${binding.fromPort}`;
        }
        if (value !== undefined) {
          this.variables.set(`local.${block.id}.${localName}`, value);
          this.log(
            'info',
            containerId,
            block.id,
            `[START] ${localName} ← ${source} = ${JSON.stringify(value)}`,
          );
        }
      }
    }

    // Reset all step statuses to idle at the start of this run.
    for (const step of block.steps) {
      this.state.status[step.id] = 'idle';
    }
    this.flush();

    const topLevel = block.steps
      .filter((s) => !s.parentStepId && s.inFlow !== false)
      .sort((a, b) => a.order - b.order);

    let failed = false;
    for (const step of topLevel) {
      if (this.aborted) {
        this.markCancelled(step.id);
        continue;
      }
      await this.executeStepOrGroup(containerId, block, step, opts);
      if (this.state.status[step.id] === 'error') {
        failed = true;
        break;
      }
    }

    // END node: publish output port values to:
    //   1) the in-memory channel store (so connected downstream blocks read it)
    //   2) optionally to a scenario variable (if outputs[name] is non-empty)
    if (!failed && !this.aborted && block.outputs) {
      for (const [localName, scenarioKey] of Object.entries(block.outputs)) {
        const value =
          this.variables.get(`local.${block.id}.${localName}`) ??
          this.variables.get(`scenario.${localName}`);
        if (value === undefined) continue;
        // Always publish to the channel store for connection consumers.
        this.channels.set(`${block.id}::${localName}`, value);
        // Optionally also write to a scenario variable.
        if (scenarioKey) {
          this.variables.set(scenarioKey, value);
          this.log(
            'info',
            containerId,
            block.id,
            `[END] ${scenarioKey} ← ${localName} = ${JSON.stringify(value)}`,
          );
        } else {
          this.log(
            'info',
            containerId,
            block.id,
            `[END] channel(${localName}) = ${JSON.stringify(value)}`,
          );
        }
      }
    }

    if (this.aborted) {
      this.state.status[block.id] = 'cancelled';
    } else if (failed) {
      this.state.status[block.id] = 'error';
    } else {
      this.state.status[block.id] = 'ok';
      this.log('info', containerId, block.id, `タスク「${block.label}」完了`);
    }
    this.flush();
  }

  /** Dispatch a single step to the appropriate executor. */
  private async executeStepOrGroup(
    containerId: string,
    block: Block,
    step: Step,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    this.log(
      'info',
      containerId,
      block.id,
      `ステップ「${step.label}」(${step.type}) 開始`,
      step.id,
    );

    if (step.type === 'loop') {
      await this.executeStepLoop(containerId, block, step, opts);
    } else if (step.type === 'branch') {
      await this.executeStepBranch(containerId, block, step, opts);
    } else if (step.type === 'switch') {
      await this.executeStepSwitch(containerId, block, step, opts);
    } else if (step.type === 'group') {
      await this.executeStepGroup(containerId, block, step, opts);
    } else {
      await this.executeStep(containerId, block, step, opts);
    }

    const status = this.state.status[step.id];
    if (status === 'ok') {
      this.log(
        'info',
        containerId,
        block.id,
        `ステップ「${step.label}」完了`,
        step.id,
      );
    } else if (status === 'error') {
      this.log(
        'error',
        containerId,
        block.id,
        `ステップ「${step.label}」エラー`,
        step.id,
      );
    }
  }

  /**
   * Execute a leaf step (action / wait / subroutine).
   * Subroutine steps delegate to executeSubroutine; all others build
   * a NodeCall and go through the retry/onError policy in executeBlock.
   */
  private async executeStep(
    containerId: string,
    _block: Block,
    step: Step,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    if (step.type === 'subroutine') {
      await this.executeSubroutine(containerId, step);
      return;
    }

    const nodeCall: NodeCall = {
      id: step.id,
      label: step.label,
      type: step.type,
      nodeId: step.nodeId,
      params: step.params,
      bindings: step.bindings,
      timeout: step.timeout,
      skipIfMissing: step.skipIfMissing,
      onError: step.onError,
    };
    await this.executeBlock(containerId, nodeCall, opts);
  }

  /** Execute a group step — runs child steps sequentially. */
  private async executeStepGroup(
    containerId: string,
    block: Block,
    groupStep: Step,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    this.state.status[groupStep.id] = 'running';
    this.flush();

    const children = this.stepChildrenOf(block.steps, groupStep.id);

    let failed = false;
    for (const child of children) {
      if (this.aborted) {
        this.markCancelled(child.id);
        continue;
      }
      await this.executeStepOrGroup(containerId, block, child, opts);
      if (this.state.status[child.id] === 'error') {
        failed = true;
        break;
      }
    }

    if (this.aborted) {
      this.state.status[groupStep.id] = 'cancelled';
    } else if (failed) {
      this.state.status[groupStep.id] = 'error';
    } else {
      this.state.status[groupStep.id] = 'ok';
    }
    this.flush();
  }

  /** Children of a step within the block's step pool, sorted by order. */
  private stepChildrenOf(
    steps: Step[],
    parentId: string,
    branch?: string,
  ): Step[] {
    return steps
      .filter(
        (s) =>
          s.parentStepId === parentId &&
          (branch === undefined || (s.parentBranch ?? '') === branch),
      )
      .sort((a, b) => a.order - b.order);
  }

  /** Loop step — mirrors executeLoop but uses stepChildrenOf. */
  private async executeStepLoop(
    containerId: string,
    block: Block,
    loopStep: Step,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    const LOOP_MAX = 10_000;
    const params = (loopStep.params as Record<string, unknown>) ?? {};
    const whileCondition =
      params.whileCondition !== undefined ? params.whileCondition : null;
    const rawIterations = params.iterations;
    const iterations =
      typeof rawIterations === 'number' && rawIterations > 0
        ? Math.floor(rawIterations)
        : 1;

    this.state.status[loopStep.id] = 'running';
    this.log(
      'info',
      containerId,
      loopStep.id,
      whileCondition !== null
        ? `ループ開始 (条件式、最大 ${LOOP_MAX} 回)`
        : `ループ開始 (${iterations} 回)`,
    );
    this.flush();

    const children = this.stepChildrenOf(block.steps, loopStep.id);
    const evalVars = {
      getVariable: (key: string) => this.variables.get(key),
      onWarn: (msg: string) =>
        this.log('warn', containerId, loopStep.id, `条件式: ${msg}`),
    };

    let failed = false;
    let i = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.aborted) break;
      if (whileCondition !== null) {
        if (!evalBool(whileCondition, evalVars)) break;
        if (i >= LOOP_MAX) {
          this.log(
            'warn',
            containerId,
            loopStep.id,
            `ループ上限 ${LOOP_MAX} 回に到達、打ち切り`,
          );
          break;
        }
      } else {
        if (i >= iterations) break;
      }
      if (whileCondition !== null || iterations > 1) {
        this.log(
          'info',
          containerId,
          loopStep.id,
          whileCondition !== null
            ? `反復 ${i + 1} (条件式)`
            : `反復 ${i + 1}/${iterations}`,
        );
      }
      this.variables.set(`track.${containerId}.loop_index`, i);
      for (const child of children) {
        if (this.aborted) break;
        await this.executeStepOrGroup(containerId, block, child, opts);
        if (this.state.status[child.id] === 'error') {
          failed = true;
          break;
        }
      }
      if (failed) break;
      i++;
    }

    if (this.aborted) {
      this.state.status[loopStep.id] = 'cancelled';
    } else if (failed) {
      this.state.status[loopStep.id] = 'error';
    } else {
      this.state.status[loopStep.id] = 'ok';
      this.log('info', containerId, loopStep.id, 'ループ完了');
    }
    this.flush();
  }

  /** Branch step — mirrors executeBranch but uses stepChildrenOf. */
  private async executeStepBranch(
    containerId: string,
    block: Block,
    branchStep: Step,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    this.state.status[branchStep.id] = 'running';
    this.flush();

    const condition = (branchStep.params as Record<string, unknown>)?.condition;
    const taken = evalBool(condition, {
      getVariable: (key) => this.variables.get(key),
      onWarn: (msg) =>
        this.log('warn', containerId, branchStep.id, `条件式: ${msg}`),
    });
    this.log(
      'info',
      containerId,
      branchStep.id,
      `条件 → ${taken ? 'TRUE' : 'FALSE'}`,
    );

    const winners = this.stepChildrenOf(
      block.steps,
      branchStep.id,
      taken ? 'then' : 'else',
    );
    const losers = this.stepChildrenOf(
      block.steps,
      branchStep.id,
      taken ? 'else' : 'then',
    );
    for (const loser of losers) this.state.status[loser.id] = 'skipped';
    this.flush();

    let failed = false;
    for (const child of winners) {
      if (this.aborted) break;
      await this.executeStepOrGroup(containerId, block, child, opts);
      if (this.state.status[child.id] === 'error') {
        failed = true;
        break;
      }
    }

    if (this.aborted) {
      this.state.status[branchStep.id] = 'cancelled';
    } else if (failed) {
      this.state.status[branchStep.id] = 'error';
    } else {
      this.state.status[branchStep.id] = 'ok';
    }
    this.flush();
  }

  /** Switch step — mirrors executeSwitch but uses stepChildrenOf. */
  private async executeStepSwitch(
    containerId: string,
    block: Block,
    switchStep: Step,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    this.state.status[switchStep.id] = 'running';
    this.flush();

    const params = (switchStep.params as Record<string, unknown>) ?? {};
    const rawCases = Array.isArray(params.cases)
      ? (params.cases as unknown[]).map((c) => String(c))
      : [];
    const expression = params.expression;
    const evalVars = {
      getVariable: (key: string) => this.variables.get(key),
      onWarn: (msg: string) =>
        this.log('warn', containerId, switchStep.id, `式: ${msg}`),
    };
    const value = evalJsonLogic(expression, evalVars);

    const looseMatch = (caseLabel: string): boolean => {
      if (caseLabel === 'default') return false;
      if (caseLabel === String(value)) return true;
      if (typeof value === 'number' && !Number.isNaN(Number(caseLabel))) {
        return Number(caseLabel) === value;
      }
      if (typeof value === 'boolean') {
        return (
          (caseLabel === 'true' && value === true) ||
          (caseLabel === 'false' && value === false)
        );
      }
      return false;
    };

    let winningCase: string | null = rawCases.find(looseMatch) ?? null;
    if (winningCase === null && rawCases.includes('default')) {
      winningCase = 'default';
    }
    this.log(
      'info',
      containerId,
      switchStep.id,
      `条件 → ${JSON.stringify(value)} / 一致: ${winningCase ?? '(なし)'}`,
    );

    for (const caseLabel of rawCases) {
      if (caseLabel === winningCase) continue;
      for (const child of this.stepChildrenOf(
        block.steps,
        switchStep.id,
        caseLabel,
      )) {
        this.state.status[child.id] = 'skipped';
      }
    }
    this.flush();

    let failed = false;
    if (winningCase !== null) {
      const winners = this.stepChildrenOf(
        block.steps,
        switchStep.id,
        winningCase,
      );
      for (const child of winners) {
        if (this.aborted) break;
        await this.executeStepOrGroup(containerId, block, child, opts);
        if (this.state.status[child.id] === 'error') {
          failed = true;
          break;
        }
      }
    }

    if (this.aborted) {
      this.state.status[switchStep.id] = 'cancelled';
    } else if (failed) {
      this.state.status[switchStep.id] = 'error';
    } else {
      this.state.status[switchStep.id] = 'ok';
    }
    this.flush();
  }

  private async runErrorHandler(track: Track): Promise<void> {
    // Slot-aware cleanup (stack-unwind style):
    // - Only run blocks whose catchSlot (or their slot) is at or before
    //   the slot where the error occurred.
    // - Run in reverse slot order (deepest cleanup first).
    // - If errorSlot is null, fall back to running all blocks in forward order.
    const errSlot = this.errorSlot;
    const blocks = track.blocks.slice();
    let sorted: Block[];
    if (errSlot !== null) {
      sorted = blocks
        .filter((b) => (b.catchSlot ?? b.slot) <= errSlot)
        .sort((a, b) => b.slot - a.slot); // reverse
      this.log(
        'info',
        undefined,
        undefined,
        `エラーハンドラ: slot ${errSlot} で発生 → ${sorted.length} 個のクリーンアップを逆順実行`,
      );
    } else {
      sorted = blocks.sort((a, b) => a.slot - b.slot);
    }

    for (const block of sorted) {
      // Error handler forces onError = skip (see docs/02-error-handling.md)
      // so a cleanup failure never re-escalates.
      const forced: Block = { ...block, onError: 'skip' };
      this.state.currentSlot[track.id] = block.slot;
      await this.executeBlockOrGroup(track.id, track.blocks, forced, {
        isErrorHandler: true,
      });
    }
    delete this.state.currentSlot[track.id];
    this.flush();
  }

  /**
   * Execute a leaf node call, including retry loops and the `onError`
   * policy. Delegates to the Runtime for actual execution.
   */
  private async executeBlock(
    trackId: string,
    node: NodeCall,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    const policy: OnError = node.onError ?? 'abort';
    let retriesLeft = 0;
    let retryFallThrough: 'abort' | 'skip' = 'abort';
    if (typeof policy === 'object') {
      retriesLeft = policy.retry;
      retryFallThrough = policy.then;
    }

    for (let attempt = 1; ; attempt++) {
      this.state.status[node.id] = 'running';
      this.flush();

      const ctx: NodeContext = {
        blockId: node.id,
        trackId,
        log: (level, message) => this.log(level, trackId, node.id, message),
        cancelled: () => this.aborted,
        sleep: (ms) => this.sleep(ms),
        getVariable: (key) => this.variables.get(key),
        setVariable: (key, value) => {
          this.variables.set(key, value);
        },
      };

      let result;
      try {
        result = await this.runtime.run(node, ctx);
      } catch (err) {
        result = { ok: false, errorMessage: `runtime threw: ${String(err)}` };
      }

      if (this.aborted && !opts.isErrorHandler) {
        this.state.status[node.id] = 'cancelled';
        this.flush();
        return;
      }

      if (result.ok) {
        this.state.status[node.id] = 'ok';
        this.flush();
        return;
      }

      // skipIfMissing short-circuit.
      if (node.skipIfMissing && result.missing) {
        this.state.status[node.id] = 'skipped';
        this.log(
          'info',
          trackId,
          node.id,
          'ターゲット欠落だが skipIfMissing により継続',
        );
        this.flush();
        return;
      }

      this.log(
        'error',
        trackId,
        node.id,
        `失敗 (${attempt}回目): ${result.errorMessage ?? 'unknown'}`,
      );

      // Retry?
      if (retriesLeft > 0) {
        retriesLeft--;
        this.log(
          'info',
          trackId,
          node.id,
          `${retriesLeft + 1} 回目のリトライを実施`,
        );
        await this.sleep(400);
        if (this.aborted && !opts.isErrorHandler) {
          this.state.status[node.id] = 'cancelled';
          this.flush();
          return;
        }
        continue;
      }

      // Final handling: resolve the effective policy.
      let finalPolicy: 'abort' | 'skip' | 'ignore';
      if (policy === 'abort' || policy === 'skip' || policy === 'ignore') {
        finalPolicy = policy;
      } else {
        finalPolicy = retryFallThrough;
      }
      if (opts.isErrorHandler) finalPolicy = 'skip';

      if (finalPolicy === 'ignore') {
        this.state.status[node.id] = 'ok';
        this.log('warn', trackId, node.id, 'エラー無視で継続');
        this.flush();
        return;
      }
      if (finalPolicy === 'skip') {
        this.state.status[node.id] = 'skipped';
        this.log('warn', trackId, node.id, 'エラーのためスキップ');
        this.flush();
        return;
      }
      // abort
      this.state.status[node.id] = 'error';
      // Capture the slot at which the error occurred for slot-aware cleanup.
      const errSlot = this.state.currentSlot[trackId];
      if (errSlot !== undefined) this.errorSlot = errSlot;
      this.log(
        'error',
        trackId,
        node.id,
        `onError=abort → シナリオ全体を中止 (slot ${this.errorSlot ?? '?'})`,
      );
      this.flush();
      this.abort();
      return;
    }
  }

  private async executeSubroutine(
    trackId: string,
    callStep: Step,
  ): Promise<void> {
    const sub = callStep.subroutineId
      ? this.scenario.subroutines.find((s) => s.id === callStep.subroutineId)
      : undefined;

    if (!sub) {
      this.state.status[callStep.id] = 'skipped';
      this.log(
        'warn',
        trackId,
        callStep.id,
        'サブルーチン未割当のためスキップ',
      );
      this.flush();
      return;
    }

    this.state.status[callStep.id] = 'running';
    this.log('info', trackId, callStep.id, `サブルーチン「${sub.name}」呼出`);
    this.flush();

    const sorted = sub.blocks.slice().sort((a, b) => a.slot - b.slot);
    for (const sb of sorted) {
      if (this.aborted) {
        this.markCancelled(sb.id);
        continue;
      }
      this.state.currentSlot[sub.id] = sb.slot;
      await this.executeBlockOrGroup(sub.id, sub.blocks, sb, {
        isErrorHandler: false,
      });
      if (this.state.status[sb.id] === 'error' || this.aborted) {
        this.state.status[callStep.id] = 'error';
        this.flush();
        return;
      }
    }
    delete this.state.currentSlot[sub.id];
    this.state.status[callStep.id] = 'ok';
    this.log('info', trackId, callStep.id, `サブルーチン「${sub.name}」完了`);
    this.flush();
  }

  // ────────────────────────────────────────────────────────────────────
  // Sync primitive + helpers
  // ────────────────────────────────────────────────────────────────────

  private waitForBlocks(depIds: string[]): Promise<void> {
    if (depIds.length === 0) return Promise.resolve();
    if (this.allTerminal(depIds) || this.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.waiters.push({ deps: depIds, resolve });
    });
  }

  private allTerminal(depIds: string[]): boolean {
    return depIds.every((id) => isTerminal(this.state.status[id]));
  }

  /** Re-check every waiter. Any whose deps are all terminal is resolved. */
  private notifyWaiters(): void {
    if (this.waiters.length === 0) return;
    const stillWaiting: Waiter[] = [];
    for (const w of this.waiters) {
      if (this.aborted || this.allTerminal(w.deps)) {
        w.resolve();
      } else {
        stillWaiting.push(w);
      }
    }
    this.waiters = stillWaiting;
  }

  private markCancelled(blockId: string): void {
    if (this.state.status[blockId] === undefined) return;
    if (!isTerminal(this.state.status[blockId])) {
      this.state.status[blockId] = 'cancelled';
      this.flush();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(
    level: LogEntry['level'],
    trackId: string | undefined,
    blockId: string | undefined,
    message: string,
    stepId?: string,
  ): void {
    this.state.logs.push({
      id: this.logId++,
      time: Date.now(),
      level,
      trackId,
      blockId,
      ...(stepId ? { stepId } : {}),
      message,
    });
    // Bound history so long-running scenarios don't grow unbounded.
    if (this.state.logs.length > 300) {
      this.state.logs.splice(0, this.state.logs.length - 300);
    }
  }

  private flush(): void {
    this.notifyWaiters();
    // Materialise the mutable variable store into a plain object
    // for the snapshot. Done inside flush so subscribers always see
    // the latest values — the VariablesModal reads this when the
    // user opens it mid-run.
    const variables: Record<string, unknown> = {};
    for (const [k, v] of this.variables) variables[k] = v;
    this.hooks.onStateChange({
      ...this.state,
      status: { ...this.state.status },
      currentSlot: { ...this.state.currentSlot },
      logs: this.state.logs.slice(),
      variables,
    });
  }
}
