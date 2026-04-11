import type { Block, OnError, Scenario, Track } from '../types';
import type {
  BlockStatus,
  ExecutionState,
  LogEntry,
} from './types';
import type { NodeContext, Runtime } from './runtime';
import { evalBool, evalJsonLogic } from './jsonLogic';

export interface ExecutionHooks {
  onStateChange(state: ExecutionState): void;
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
 * 2. Wait for `deps` and sync points before running a block.
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

  constructor(scenario: Scenario, runtime: Runtime, hooks: ExecutionHooks) {
    this.scenario = scenario;
    this.runtime = runtime;
    this.hooks = hooks;
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
    // Initialize every block's status to idle so the UI can distinguish
    // "not yet executed" from "absent".
    for (const t of this.scenario.tracks) {
      for (const b of t.blocks) this.state.status[b.id] = 'idle';
    }
    for (const b of this.scenario.errorHandler.blocks) {
      this.state.status[b.id] = 'idle';
    }
    for (const s of this.scenario.subroutines) {
      for (const b of s.blocks) this.state.status[b.id] = 'idle';
    }
    this.log('info', undefined, undefined, 'シナリオ実行開始');
    this.flush();

    try {
      await Promise.all(
        this.scenario.tracks.map((t) => this.runTrack(t)),
      );
    } catch (err) {
      this.log(
        'error',
        undefined,
        undefined,
        `エンジン内部エラー: ${String(err)}`,
      );
    }

    if (this.aborted) {
      this.state.phase = 'error-handler';
      this.flush();
      if (this.scenario.errorHandler.blocks.length > 0) {
        this.log('warn', undefined, undefined, 'エラー処理トラック実行');
        await this.runErrorHandler(this.scenario.errorHandler);
      }
      this.state.phase = 'aborted';
      this.log('warn', undefined, undefined, 'シナリオ中止');
    } else {
      this.state.phase = 'done';
      this.log('info', undefined, undefined, 'シナリオ完了');
    }

    this.state.running = false;
    // Clear track playheads so the UI doesn't keep a final highlight.
    this.state.currentSlot = {};
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
    // Only top-level blocks drive the outer loop. Blocks with a
    // parentBlockId run inside their container's body (loop body or
    // branch then/else) and are dispatched by executeContainer.
    const topLevel = track.blocks
      .filter((b) => !b.parentBlockId)
      .sort((a, b) => a.slot - b.slot);
    const crossedSyncSlots = new Set<number>();

    for (const block of topLevel) {
      if (this.aborted) {
        this.markCancelled(block.id);
        // Cascade cancel to children so the UI shows them greyed out.
        for (const child of this.childrenOf(track.blocks, block.id)) {
          this.markCancelled(child.id);
        }
        continue;
      }

      // Cross any sync points whose slot is at or before this block and
      // that haven't been crossed yet by this track.
      const syncsToCross = this.scenario.syncPoints
        .filter(
          (sp) =>
            sp.slot <= block.slot &&
            !crossedSyncSlots.has(sp.slot) &&
            (sp.trackIds.length === 0 || sp.trackIds.includes(track.id)),
        )
        .sort((a, b) => a.slot - b.slot);
      for (const sp of syncsToCross) {
        if (this.aborted) break;
        this.log('info', track.id, undefined, `同期ポイント #${sp.slot} 待機`);
        await this.waitForBlocks(sp.deps);
        crossedSyncSlots.add(sp.slot);
      }

      if (this.aborted) {
        this.markCancelled(block.id);
        continue;
      }

      // Wait for this block's DAG deps.
      if (block.deps.length > 0) {
        await this.waitForBlocks(block.deps);
      }
      if (this.aborted) {
        this.markCancelled(block.id);
        continue;
      }

      // If any dep ended in `error`, skip this block transitively.
      const depFailed = block.deps.some(
        (id) => this.state.status[id] === 'error',
      );
      if (depFailed) {
        this.state.status[block.id] = 'skipped';
        // Children inherit the skip so the UI doesn't pretend they
        // ran on their own.
        for (const child of this.childrenOf(track.blocks, block.id)) {
          this.state.status[child.id] = 'skipped';
        }
        this.log(
          'warn',
          track.id,
          block.id,
          '依存ブロックが失敗したためスキップ',
        );
        this.flush();
        continue;
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
   * Dispatch a block to either the regular-block path or a
   * container-aware path. Containers (loop / branch) recurse into
   * their child blocks using the same track's block pool and the
   * parentBlockId / parentBranch links.
   */
  private async executeBlockOrGroup(
    containerId: string,
    trackBlocks: Block[],
    block: Block,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    if (block.type === 'loop') {
      await this.executeLoop(containerId, trackBlocks, block, opts);
      return;
    }
    if (block.type === 'branch') {
      await this.executeBranch(containerId, trackBlocks, block, opts);
      return;
    }
    if (block.type === 'switch') {
      await this.executeSwitch(containerId, trackBlocks, block, opts);
      return;
    }
    await this.executeBlock(containerId, block, opts);
  }

  /**
   * Children of ``parentId`` within the given track block pool,
   * optionally filtered by parentBranch / case label. Sorted by
   * slot so execution order matches visual order. Passing
   * ``branch`` matches exact string equality — branches use
   * ``'then'``/``'else'`` conventionally, switches use whatever
   * case labels are declared on the parent.
   */
  private childrenOf(
    trackBlocks: Block[],
    parentId: string,
    branch?: string,
  ): Block[] {
    return trackBlocks
      .filter(
        (b) =>
          b.parentBlockId === parentId &&
          (branch === undefined || (b.parentBranch ?? '') === branch),
      )
      .sort((a, b) => a.slot - b.slot);
  }

  /**
   * Execute a loop block's body. Two modes are supported:
   *
   * - **Fixed count** — ``params.iterations`` runs the body N times
   *   (default 1). Simple counter loops, most scenarios.
   * - **While condition** — ``params.whileCondition`` is a JSON
   *   Logic expression re-evaluated before each iteration. The body
   *   runs while the expression is truthy. We cap the loop at
   *   ``LOOP_MAX`` iterations so a broken condition can't hang the
   *   scenario.
   *
   * ``whileCondition`` takes precedence when both are set. Body
   * execution stops early on abort or on a child that escalated to
   * error. The loop block itself is marked ``running`` across all
   * iterations, then ``ok`` / ``error`` / ``cancelled`` at the end.
   */
  private async executeLoop(
    containerId: string,
    trackBlocks: Block[],
    loopBlock: Block,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    const LOOP_MAX = 10_000;
    const params = (loopBlock.params as Record<string, unknown>) ?? {};
    const whileCondition =
      params.whileCondition !== undefined ? params.whileCondition : null;
    const rawIterations = params.iterations;
    const iterations =
      typeof rawIterations === 'number' && rawIterations > 0
        ? Math.floor(rawIterations)
        : 1;

    this.state.status[loopBlock.id] = 'running';
    if (whileCondition !== null) {
      this.log(
        'info',
        containerId,
        loopBlock.id,
        `ループ開始 (条件式、最大 ${LOOP_MAX} 回)`,
      );
    } else {
      this.log(
        'info',
        containerId,
        loopBlock.id,
        `ループ開始 (${iterations} 回)`,
      );
    }
    this.flush();

    const children = this.childrenOf(trackBlocks, loopBlock.id);
    const evalVars = {
      getVariable: (key: string) => this.variables.get(key),
      onWarn: (msg: string) =>
        this.log('warn', containerId, loopBlock.id, `条件式: ${msg}`),
    };

    let failed = false;
    let i = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.aborted) break;

      // Stopping condition depends on mode.
      if (whileCondition !== null) {
        if (!evalBool(whileCondition, evalVars)) break;
        if (i >= LOOP_MAX) {
          this.log(
            'warn',
            containerId,
            loopBlock.id,
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
          loopBlock.id,
          whileCondition !== null
            ? `反復 ${i + 1} (条件式)`
            : `反復 ${i + 1}/${iterations}`,
        );
      }
      // Seed the iteration index as a track-scope variable so child
      // blocks can read it via bindings like ``track.<id>.loop_index``.
      this.variables.set(`track.${containerId}.loop_index`, i);
      for (const child of children) {
        if (this.aborted) break;
        await this.executeBlockOrGroup(containerId, trackBlocks, child, opts);
        if (this.state.status[child.id] === 'error') {
          failed = true;
          break;
        }
      }
      if (failed) break;
      i++;
    }

    if (this.aborted) {
      this.state.status[loopBlock.id] = 'cancelled';
    } else if (failed) {
      this.state.status[loopBlock.id] = 'error';
    } else {
      this.state.status[loopBlock.id] = 'ok';
      this.log('info', containerId, loopBlock.id, 'ループ完了');
    }
    this.flush();
  }

  /**
   * Execute a branch block: evaluate its JSON Logic condition
   * against the scenario variable store, then run the children on
   * the winning side only. The losing side is marked ``skipped`` so
   * the UI shows which path was taken.
   */
  private async executeBranch(
    containerId: string,
    trackBlocks: Block[],
    branchBlock: Block,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    this.state.status[branchBlock.id] = 'running';
    this.flush();

    const condition = (branchBlock.params as Record<string, unknown>)
      ?.condition;
    const taken = evalBool(condition, {
      getVariable: (key) => this.variables.get(key),
      onWarn: (msg) =>
        this.log('warn', containerId, branchBlock.id, `条件式: ${msg}`),
    });

    this.log(
      'info',
      containerId,
      branchBlock.id,
      `条件 → ${taken ? 'TRUE' : 'FALSE'}`,
    );

    const winners = this.childrenOf(
      trackBlocks,
      branchBlock.id,
      taken ? 'then' : 'else',
    );
    const losers = this.childrenOf(
      trackBlocks,
      branchBlock.id,
      taken ? 'else' : 'then',
    );
    for (const loser of losers) {
      this.state.status[loser.id] = 'skipped';
    }
    this.flush();

    let failed = false;
    for (const child of winners) {
      if (this.aborted) break;
      await this.executeBlockOrGroup(containerId, trackBlocks, child, opts);
      if (this.state.status[child.id] === 'error') {
        failed = true;
        break;
      }
    }

    if (this.aborted) {
      this.state.status[branchBlock.id] = 'cancelled';
    } else if (failed) {
      this.state.status[branchBlock.id] = 'error';
    } else {
      this.state.status[branchBlock.id] = 'ok';
    }
    this.flush();
  }

  /**
   * Execute a switch block: evaluate ``params.expression`` with
   * JSON Logic, compare the result (loosely) against each entry in
   * ``params.cases``, and run the children whose ``parentBranch``
   * matches the first winning case. If no case matches, the
   * conventional ``"default"`` case is used as a fallback when
   * present — otherwise no children run and the switch resolves
   * to ``ok``.
   *
   * Children belonging to losing cases are marked ``skipped`` so
   * the user can see which path the executor took.
   */
  private async executeSwitch(
    containerId: string,
    trackBlocks: Block[],
    switchBlock: Block,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    this.state.status[switchBlock.id] = 'running';
    this.flush();

    const params = (switchBlock.params as Record<string, unknown>) ?? {};
    const rawCases = Array.isArray(params.cases)
      ? (params.cases as unknown[]).map((c) => String(c))
      : [];
    const expression = params.expression;

    const evalVars = {
      getVariable: (key: string) => this.variables.get(key),
      onWarn: (msg: string) =>
        this.log('warn', containerId, switchBlock.id, `式: ${msg}`),
    };
    const value = evalJsonLogic(expression, evalVars);

    // Loose-match each case string against the evaluated value.
    // Same semantics as the jsonLogic `==` operator so "5" and 5
    // match — matches how scenario authors would expect coming
    // from a config file.
    const looseMatch = (caseLabel: string): boolean => {
      if (caseLabel === 'default') return false; // default handled below
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

    let winningCase: string | null =
      rawCases.find(looseMatch) ?? null;
    if (winningCase === null && rawCases.includes('default')) {
      winningCase = 'default';
    }

    this.log(
      'info',
      containerId,
      switchBlock.id,
      `条件 → ${JSON.stringify(value)} / 一致: ${winningCase ?? '(なし)'}`,
    );

    // Mark all non-winning children as skipped.
    for (const caseLabel of rawCases) {
      if (caseLabel === winningCase) continue;
      for (const child of this.childrenOf(
        trackBlocks,
        switchBlock.id,
        caseLabel,
      )) {
        this.state.status[child.id] = 'skipped';
      }
    }
    this.flush();

    let failed = false;
    if (winningCase !== null) {
      const winners = this.childrenOf(
        trackBlocks,
        switchBlock.id,
        winningCase,
      );
      for (const child of winners) {
        if (this.aborted) break;
        await this.executeBlockOrGroup(containerId, trackBlocks, child, opts);
        if (this.state.status[child.id] === 'error') {
          failed = true;
          break;
        }
      }
    }

    if (this.aborted) {
      this.state.status[switchBlock.id] = 'cancelled';
    } else if (failed) {
      this.state.status[switchBlock.id] = 'error';
    } else {
      this.state.status[switchBlock.id] = 'ok';
    }
    this.flush();
  }

  private async runErrorHandler(track: Track): Promise<void> {
    const topLevel = track.blocks
      .filter((b) => !b.parentBlockId)
      .sort((a, b) => a.slot - b.slot);
    for (const block of topLevel) {
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
   * Execute a single block, including retry loops and the `onError`
   * policy. Subroutine blocks recurse via `executeSubroutine`.
   */
  private async executeBlock(
    trackId: string,
    block: Block,
    opts: { isErrorHandler: boolean },
  ): Promise<void> {
    if (block.type === 'subroutine') {
      await this.executeSubroutine(trackId, block);
      return;
    }

    const policy: OnError = block.onError ?? 'abort';
    let retriesLeft = 0;
    let retryFallThrough: 'abort' | 'skip' = 'abort';
    if (typeof policy === 'object') {
      retriesLeft = policy.retry;
      retryFallThrough = policy.then;
    }

    for (let attempt = 1; ; attempt++) {
      this.state.status[block.id] = 'running';
      this.flush();

      const ctx: NodeContext = {
        blockId: block.id,
        trackId,
        log: (level, message) => this.log(level, trackId, block.id, message),
        cancelled: () => this.aborted,
        sleep: (ms) => this.sleep(ms),
        getVariable: (key) => this.variables.get(key),
        setVariable: (key, value) => {
          this.variables.set(key, value);
        },
      };

      let result;
      try {
        result = await this.runtime.run(block, ctx);
      } catch (err) {
        result = { ok: false, errorMessage: `runtime threw: ${String(err)}` };
      }

      if (this.aborted && !opts.isErrorHandler) {
        this.state.status[block.id] = 'cancelled';
        this.flush();
        return;
      }

      if (result.ok) {
        this.state.status[block.id] = 'ok';
        this.flush();
        return;
      }

      // skipIfMissing short-circuit: a "target not found" failure on a
      // block marked `skipIfMissing` is not an error.
      if (block.skipIfMissing && result.missing) {
        this.state.status[block.id] = 'skipped';
        this.log(
          'info',
          trackId,
          block.id,
          'ターゲット欠落だが skipIfMissing により継続',
        );
        this.flush();
        return;
      }

      this.log(
        'error',
        trackId,
        block.id,
        `失敗 (${attempt}回目): ${result.errorMessage ?? 'unknown'}`,
      );

      // Retry?
      if (retriesLeft > 0) {
        retriesLeft--;
        this.log(
          'info',
          trackId,
          block.id,
          `${retriesLeft + 1} 回目のリトライを実施`,
        );
        // Small fixed backoff — matches the doc's "1s fixed" intent but
        // shortened here so the mock doesn't drag.
        await this.sleep(400);
        if (this.aborted && !opts.isErrorHandler) {
          this.state.status[block.id] = 'cancelled';
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
        this.state.status[block.id] = 'ok';
        this.log('warn', trackId, block.id, 'エラー無視で継続');
        this.flush();
        return;
      }
      if (finalPolicy === 'skip') {
        this.state.status[block.id] = 'skipped';
        this.log('warn', trackId, block.id, 'エラーのためスキップ');
        this.flush();
        return;
      }
      // abort
      this.state.status[block.id] = 'error';
      this.log(
        'error',
        trackId,
        block.id,
        'onError=abort → シナリオ全体を中止',
      );
      this.flush();
      this.abort();
      return;
    }
  }

  private async executeSubroutine(
    trackId: string,
    callBlock: Block,
  ): Promise<void> {
    const sub = callBlock.subroutineId
      ? this.scenario.subroutines.find((s) => s.id === callBlock.subroutineId)
      : undefined;

    if (!sub) {
      this.state.status[callBlock.id] = 'skipped';
      this.log(
        'warn',
        trackId,
        callBlock.id,
        'サブルーチン未割当のためスキップ',
      );
      this.flush();
      return;
    }

    this.state.status[callBlock.id] = 'running';
    this.log('info', trackId, callBlock.id, `サブルーチン「${sub.name}」呼出`);
    this.flush();

    const topLevel = sub.blocks
      .filter((b) => !b.parentBlockId)
      .sort((a, b) => a.slot - b.slot);
    for (const sb of topLevel) {
      if (this.aborted) {
        this.markCancelled(sb.id);
        continue;
      }
      this.state.currentSlot[sub.id] = sb.slot;
      await this.executeBlockOrGroup(sub.id, sub.blocks, sb, {
        isErrorHandler: false,
      });
      if (this.state.status[sb.id] === 'error' || this.aborted) {
        // Propagate sub-failure up to the call block.
        this.state.status[callBlock.id] = 'error';
        this.flush();
        return;
      }
    }
    delete this.state.currentSlot[sub.id];
    this.state.status[callBlock.id] = 'ok';
    this.log('info', trackId, callBlock.id, `サブルーチン「${sub.name}」完了`);
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
  ): void {
    this.state.logs.push({
      id: this.logId++,
      time: Date.now(),
      level,
      trackId,
      blockId,
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
