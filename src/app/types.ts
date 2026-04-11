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

export type BlockType =
  | 'action'
  | 'wait'
  | 'loop'
  | 'branch'
  | 'switch'
  | 'subroutine';

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

/**
 * One end of a port binding.
 *
 * - `var`     — engine resolves the value from the scenario variable
 *               store at runtime, e.g. `scenario.target` or
 *               `track.loop_index`. Used for both in-ports (read
 *               before run_node) and out-ports (written after result).
 * - `literal` — a hardcoded value stored on the block itself. Only
 *               makes sense for in-ports; the engine forwards `value`
 *               verbatim into the run_node payload.
 */
export type PortBinding =
  | { kind: 'var'; key: string }
  | { kind: 'literal'; value: unknown };

export interface Block {
  id: string;
  type: BlockType;
  label: string;
  /**
   * Fully-qualified node id, e.g. ``desktop/click``. When set, the
   * engine dispatches this block to the Python worker via
   * ``IpcRuntime``; when unset, the block falls back to ``MockRuntime``
   * so legacy scenarios animate without touching Python.
   */
  nodeId?: string;
  /** Visual slot on the track (0-indexed). Unique per track. */
  slot: number;
  /** Ids of blocks this one depends on (DAG edges). */
  deps: string[];
  /** Free-form node parameters. Overrides node decorator defaults. */
  params?: Record<string, unknown>;
  /**
   * Port bindings. Key is the node's port name as declared on its
   * Python ``@node(ports=...)`` decorator; value is either a
   * scenario-variable reference or a hardcoded literal. In-ports
   * are resolved before ``run_node`` on the engine side; out-ports
   * reflect back into the variable store after the worker result
   * (only ``var`` bindings are written back). See docs/03-nodes.md
   * (rev2).
   */
  bindings?: Record<string, PortBinding>;
  /** Max runtime in seconds. Undefined = engine default. */
  timeout?: number;
  /** If true, a missing target is not an error — silently skip. */
  skipIfMissing?: boolean;
  /** Error handling policy. Undefined = abort. */
  onError?: OnError;
  /** For `type: 'subroutine'` blocks, the id of the subroutine to call. */
  subroutineId?: string;
  /**
   * Id of the container block (loop / branch) this block is nested
   * inside. When set, the renderer wraps the container and its
   * children in a coloured frame so the scope is visually obvious,
   * and the engine executes the children inside the container's
   * control flow (loop body, branch `then`/`else`).
   *
   * Children must live on the same track as their parent. Nested
   * containers are supported — a container may itself live inside
   * another container, as long as the parent chain has no cycles.
   */
  parentBlockId?: string;
  /**
   * Which case of the parent container this block belongs to.
   *
   * - Branch parent  → ``"then"`` / ``"else"``
   * - Switch parent  → one of the strings listed in
   *                    ``parent.params.cases`` (including the
   *                    conventional ``"default"`` fallback).
   * - Loop parent    → ignored (single body).
   *
   * A fresh drop into a multi-case container picks the first case
   * as the default; the user can flip it via the Inspector.
   */
  parentBranch?: string;
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
  switch: { color: '#EC4899', icon: '⧉', label: 'スイッチ' },
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
