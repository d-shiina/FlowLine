/**
 * FLOWLINE scenario model.
 *
 * The horizontal axis is block-based: each block occupies exactly one slot
 * (1 slot = 1 logical step). Execution order is defined by `deps` (DAG
 * edges), not by position. A block's `slot` is purely for visual layout,
 * and the renderer guarantees no two blocks on the same track share a slot.
 *
 * Error handling follows a 3-layer model — see docs/02-error-handling.md.
 */

export type BlockType = 'action' | 'wait' | 'loop' | 'branch' | 'subroutine';

/**
 * Per-block error policy.
 *
 * - `abort`  (default)  escalate to scenario-wide cancel + error handler track
 * - `skip`   log a warning and continue to the next block
 * - `ignore` silently continue (for expected misses)
 * - retry    try up to `retry` times, then fall through to `then`
 *
 * Note: `skipIfMissing` on the Block itself handles "target doesn't exist,
 * that's OK" separately from runtime failures.
 */
export type OnError =
  | 'abort'
  | 'skip'
  | 'ignore'
  | { retry: number; then: 'abort' | 'skip' };

export interface Block {
  id: string;
  type: BlockType;
  label: string;
  /** Fully-qualified node id, e.g. "desktop/click". Phase 2 engine uses this. */
  nodeId?: string;
  /** Visual slot on the track (0-indexed). Unique per track. */
  slot: number;
  /** Ids of blocks this one depends on (DAG edges). */
  deps: string[];
  /** Free-form node parameters. Overrides node decorator defaults. */
  params?: Record<string, unknown>;
  /** Variable references this block reads. */
  inputs?: string[];
  /** Variable references this block writes. */
  outputs?: string[];
  /** Max runtime in seconds. Undefined = engine default. */
  timeout?: number;
  /** If true, a missing target is not an error — silently skip. */
  skipIfMissing?: boolean;
  /** Error handling policy. Undefined = abort. */
  onError?: OnError;
}

export interface Track {
  id: string;
  name: string;
  color: string;
  blocks: Block[];
  variables?: {
    track?: Record<string, unknown>;
  };
}

export interface SyncPoint {
  id: string;
  label: string;
  /** Visual slot where the sync line is drawn. */
  slot: number;
  /** Ids of blocks that must all complete before sync passes. */
  deps: string[];
  /** Track ids this sync spans (for visualization). Empty = all tracks. */
  trackIds: string[];
}

export interface Subroutine {
  id: string;
  name: string;
  blocks: Block[];
}

export interface Scenario {
  version: '1.0';
  name: string;
  variables: {
    scenario: Record<string, unknown>;
  };
  tracks: Track[];
  syncPoints: SyncPoint[];
  /**
   * Single special track that runs only when an unhandled `abort` escalates.
   * Always present; an empty blocks array means "no cleanup, just stop".
   * See docs/02-error-handling.md.
   */
  errorHandler: Track;
  subroutines: Subroutine[];
}

export const BLOCK_META: Record<
  BlockType,
  { color: string; icon: string; label: string }
> = {
  action: { color: '#3B82F6', icon: '▶', label: 'アクション' },
  wait: { color: '#06B6D4', icon: '⏸', label: '待機' },
  loop: { color: '#8B5CF6', icon: '↻', label: 'ループ' },
  branch: { color: '#F59E0B', icon: '⑂', label: '分岐' },
  subroutine: { color: '#94A3B8', icon: '⎔', label: 'サブルーチン' },
};

/** Fixed id used for the scenario's error handler track. */
export const ERROR_HANDLER_ID = 'error-handler';
export const ERROR_HANDLER_COLOR = '#f43f5e';

export const TRACK_COLORS = [
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
  '#8B5CF6',
];
