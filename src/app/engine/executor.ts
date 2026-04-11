import type { Block, OnError, Scenario, Track } from '../types';
import type {
  BlockStatus,
  ExecutionState,
  LogEntry,
} from './types';
import type { NodeContext, Runtime } from './runtime';

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
    const sorted = [...track.blocks].sort((a, b) => a.slot - b.slot);
    const crossedSyncSlots = new Set<number>();

    for (const block of sorted) {
      if (this.aborted) {
        this.markCancelled(block.id);
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
      await this.executeBlock(track.id, block, { isErrorHandler: false });
    }
    // Clear the per-track playhead once the track drains.
    delete this.state.currentSlot[track.id];
    this.flush();
  }

  private async runErrorHandler(track: Track): Promise<void> {
    const sorted = [...track.blocks].sort((a, b) => a.slot - b.slot);
    for (const block of sorted) {
      // Error handler forces onError = skip (see docs/02-error-handling.md)
      // so a cleanup failure never re-escalates.
      const forced: Block = { ...block, onError: 'skip' };
      this.state.currentSlot[track.id] = block.slot;
      await this.executeBlock(track.id, forced, { isErrorHandler: true });
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

    const sorted = [...sub.blocks].sort((a, b) => a.slot - b.slot);
    for (const sb of sorted) {
      if (this.aborted) {
        this.markCancelled(sb.id);
        continue;
      }
      this.state.currentSlot[sub.id] = sb.slot;
      await this.executeBlock(sub.id, sb, { isErrorHandler: false });
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
    this.hooks.onStateChange({
      ...this.state,
      status: { ...this.state.status },
      currentSlot: { ...this.state.currentSlot },
      logs: this.state.logs.slice(),
    });
  }
}
