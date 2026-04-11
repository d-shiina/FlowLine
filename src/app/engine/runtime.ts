import type { Block } from '../types';
import type { LogEntry } from './types';

/**
 * A `Runtime` is the pluggable layer that actually "runs" a block. Phase 1
 * ships a mock runtime that just sleeps; Phase 2 will swap this for a real
 * implementation that talks to a Python worker over stdin/stdout JSON.
 */
export interface NodeContext {
  blockId: string;
  trackId: string;
  /** Append a log line scoped to the current block. */
  log(level: LogEntry['level'], message: string): void;
  /** Becomes true when the scenario has been aborted. */
  cancelled(): boolean;
  /** Abort-aware sleep. Resolves early if the scenario is cancelled. */
  sleep(ms: number): Promise<void>;
}

export interface RuntimeResult {
  ok: boolean;
  /** Set when `ok === false`. Short human-readable error summary. */
  errorMessage?: string;
  /**
   * When the failure is "target was not found" rather than a runtime
   * exception, the engine combined with `skipIfMissing` will gracefully
   * skip instead of treating it as an error.
   */
  missing?: boolean;
}

export interface Runtime {
  run(block: Block, ctx: NodeContext): Promise<RuntimeResult>;
}

/**
 * Pure-TS placeholder runtime. Each block "runs" by sleeping for a
 * type-dependent duration, emitting a couple of log lines. Blocks whose
 * label contains the literal string `FAIL` deterministically fail, which
 * lets scenarios author test error paths without wiring anything up.
 *
 * Blocks whose label contains `MISSING` fail with `missing: true` so the
 * `skipIfMissing` path can be exercised.
 */
export class MockRuntime implements Runtime {
  async run(block: Block, ctx: NodeContext): Promise<RuntimeResult> {
    const duration = this.durationFor(block);
    ctx.log('info', `実行開始 (~${duration}ms)`);

    // Cooperative sleep so abort can tear us down mid-block.
    const step = 50;
    let elapsed = 0;
    while (elapsed < duration) {
      if (ctx.cancelled()) {
        return { ok: false, errorMessage: 'cancelled' };
      }
      await ctx.sleep(Math.min(step, duration - elapsed));
      elapsed += step;
    }

    if (/MISSING/i.test(block.label)) {
      ctx.log('warn', 'ターゲットが見つかりません');
      return { ok: false, errorMessage: 'target missing', missing: true };
    }
    if (/FAIL/i.test(block.label)) {
      ctx.log('error', 'ノード実行に失敗');
      return { ok: false, errorMessage: 'mock failure' };
    }

    ctx.log('info', '完了');
    return { ok: true };
  }

  private durationFor(block: Block): number {
    switch (block.type) {
      case 'wait':
        return 900;
      case 'loop':
        return 600;
      case 'branch':
        return 250;
      case 'subroutine':
        return 400;
      case 'action':
      default:
        return 450;
    }
  }
}
