/**
 * FLOWLINE scenario model.
 *
 * The horizontal axis is block-based: each block occupies exactly one slot
 * (1 slot = 1 logical step). Execution order is defined by slot position
 * within each track. A block's `slot` is used for both visual layout and
 * ordering, and the renderer guarantees no two blocks on the same track
 * share a slot.
 *
 * Error handling follows a 3-layer model — see docs/02-error-handling.md.
 */

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

/**
 * A task block on the timeline. Blocks are pure containers: execution
 * logic lives inside ``steps``, which form a vertical flowchart.
 * Control flow (loop / branch / switch) is expressed as Step types
 * inside the flowchart rather than as block-level attributes.
 */
/**
 * How a block input is sourced.
 *
 * - `var`        — read a value from a scenario variable (config / constants)
 * - `literal`    — hardcoded value
 * - `connection` — wired from another block's output port (data flow arrow)
 *
 * Connections enforce ordering: a block waits for its connection sources to
 * complete before it can run, regardless of slot order.
 */
export type BlockInputBinding =
  | { kind: 'var'; key: string }
  | { kind: 'literal'; value: unknown }
  | { kind: 'connection'; fromBlockId: string; fromPort: string };

export interface Block {
  id: string;
  label: string;
  /** Visual slot on the track (0-indexed). Unique per track. */
  slot: number;
  /** Internal flowchart steps, executed top-to-bottom by order. */
  steps: Step[];
  /**
   * Input bindings: localName → source.
   * Three source kinds: var (scenario), literal, connection (arrow from
   * another block's output port).
   */
  inputs?: Record<string, BlockInputBinding>;
  /**
   * Output port declarations: localName → optional scenario variable key.
   * The block's run produces a value for each output port; if a scenarioKey
   * is provided, the value is also persisted into scenario variables.
   * Other blocks consume this port via { kind: 'connection', fromPort: name }.
   */
  outputs?: Record<string, string>;
  /** Max runtime in seconds for the whole task. Undefined = no limit. */
  timeout?: number;
  /** Error handling policy for the whole task. Undefined = abort. */
  onError?: OnError;
  /**
   * Error-handler-only: run this cleanup block if the error occurred at
   * or after this slot. Enables slot-aware cleanup (stack-unwind style).
   * Applied only to blocks in the scenario's errorHandler track.
   */
  catchSlot?: number;
  /** Flowchart editor: user-dragged position of the START pseudo-node. */
  startPos?: { x: number; y: number };
  /** Flowchart editor: user-dragged position of the END pseudo-node. */
  endPos?: { x: number; y: number };
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
  /**
   * Custom node sources embedded at export time so the scenario is
   * self-contained. On import, these are extracted to `_runtime/nodes/`
   * and the worker is reloaded.
   */
  embeddedNodes?: EmbeddedNode[];
}

/**
 * A custom Python node bundled inside a scenario for portability.
 * Contains the full source so the recipient doesn't need the
 * original node files installed.
 */
export interface EmbeddedNode {
  /** Node id, e.g. "custom/my-action". */
  id: string;
  /** Relative .py path under `_runtime/nodes/`, e.g. "custom/my-action.py". */
  path: string;
  /** SHA-256 hex digest of the source. Used for smart import conflict detection. */
  sourceHash: string;
  /** Python source code. */
  source: string;
  /** Manifest snapshot for offline display. */
  manifest: {
    label: string;
    labels: Record<string, string>;
    category: string;
    version: string;
    ports: Record<string, { kind: 'in' | 'out'; type?: string; required?: boolean }>;
    params: Record<string, unknown>;
    onError: string;
  };
}

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

// ── Flowchart step model ──────────────────────────────

export type StepType =
  | 'action'
  | 'wait'
  | 'loop'
  | 'branch'
  | 'switch'
  | 'subroutine'
  | 'group';

/**
 * One step inside a Block's internal flowchart.
 *
 * Steps execute top-to-bottom by ``order``. Control flow steps
 * (loop / branch / switch) nest children via ``parentStepId`` +
 * ``parentBranch``, exactly like the old Block nesting model.
 */
export interface Step {
  id: string;
  type: StepType;
  label: string;
  /** Execution order within the flowchart (0, 1, 2, ...). */
  order: number;
  /** Python node id, e.g. ``desktop/click``. */
  nodeId?: string;
  params?: Record<string, unknown>;
  bindings?: Record<string, PortBinding>;
  timeout?: number;
  skipIfMissing?: boolean;
  onError?: OnError;
  subroutineId?: string;
  /** Parent control-flow step id (for nesting inside loop/branch/switch). */
  parentStepId?: string;
  /** Case label within parent (then/else for branch, case names for switch). */
  parentBranch?: string;
  /**
   * When `false`, this step lives in the free area (not executed).
   * Undefined or `true` means the step is part of the main flow.
   */
  inFlow?: boolean;
  /** Absolute position on the canvas for free-area steps. */
  position?: { x: number; y: number };
}

export const STEP_META: Record<
  StepType,
  { color: string; icon: string; label: string }
> = {
  action: { color: '#3B82F6', icon: '▶', label: 'アクション' },
  wait: { color: '#06B6D4', icon: '⏸', label: '待機' },
  loop: { color: '#8B5CF6', icon: '↻', label: 'ループ' },
  branch: { color: '#F59E0B', icon: '⑂', label: '分岐' },
  switch: { color: '#EC4899', icon: '⧉', label: 'スイッチ' },
  subroutine: { color: '#94A3B8', icon: '⎔', label: 'サブルーチン' },
  group: { color: '#6B7280', icon: '▤', label: 'グループ' },
};
