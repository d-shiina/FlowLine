/**
 * Execution model shared between the engine core and the React hook.
 *
 * The engine mutates a single state object internally for speed, but emits
 * shallow-cloned snapshots through `ExecutionHooks.onStateChange` so React
 * can detect changes.
 */

export type BlockStatus =
  | 'idle'
  | 'running'
  | 'ok'
  | 'error'
  | 'skipped'
  | 'cancelled';

/** High-level phase of the overall execution. */
export type ExecutionPhase =
  | 'idle'
  | 'running'
  | 'error-handler'
  | 'done'
  | 'aborted';

export interface LogEntry {
  id: number;
  time: number;
  level: 'info' | 'warn' | 'error';
  trackId?: string;
  blockId?: string;
  message: string;
}

export interface ExecutionState {
  running: boolean;
  phase: ExecutionPhase;
  /** block.id → current status. */
  status: Record<string, BlockStatus>;
  /** trackId → slot currently being executed (for per-track playhead). */
  currentSlot: Record<string, number>;
  logs: LogEntry[];
  /**
   * Live snapshot of every variable the executor has observed so
   * far (both the scenario-scope seeds and transient track-scope
   * entries like `track.<id>.loop_index`). Reset between runs. The
   * VariablesModal uses this to show what each binding currently
   * evaluates to during execution — read-only, for debugging.
   */
  variables: Record<string, unknown>;
}

export const IDLE_EXECUTION_STATE: ExecutionState = {
  running: false,
  phase: 'idle',
  status: {},
  currentSlot: {},
  logs: [],
  variables: {},
};
