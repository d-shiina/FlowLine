import { useEffect, useState } from 'react';
import type { Block, OnError, PortBinding } from '../types';
import { BLOCK_META } from '../types';
import type { NodeManifestEntry, NodePortDef } from '../../globals';
import { formatLiteral, parseLiteral } from '../valueLiteral';
import { ConditionBuilder } from './ConditionBuilder';
import { Select, type SelectOption } from './ui/Select';
import { Checkbox } from './ui/Checkbox';

interface Props {
  block: Block | null;
  trackId: string | null;
  isErrorHandler: boolean;
  linkMode: boolean;
  /** Resolves a depId back to a human-readable label if possible. */
  resolveDepLabel: (depId: string) => string;
  /** Node manifest from the Python worker. Empty when worker not up. */
  nodeManifest: NodeManifestEntry[];
  /** Current scenario-scope variables (for the var picker). */
  scenarioVariables: Record<string, unknown>;
  /**
   * Loop / branch / switch blocks on the same container as the
   * selected block that it can be nested inside. For containers
   * with multiple cases (branch / switch), ``cases`` carries the
   * available lane labels so the Inspector can render a matching
   * dropdown for ``parentBranch``.
   */
  availableContainers: Array<{
    id: string;
    label: string;
    type: string;
    cases: string[];
  }>;
  /** Called when the user creates a new variable via the out-port helper. */
  onCreateVariable: (key: string, value: unknown) => void;
  onChange: (trackId: string, blockId: string, patch: Partial<Block>) => void;
  onRemoveDep: (trackId: string, blockId: string, depId: string) => void;
  onClose: () => void;
}

type OnErrorKey = 'abort' | 'skip' | 'ignore' | 'retry';
type RetryThenKey = 'abort' | 'skip';

function toKey(v: OnError | undefined): OnErrorKey {
  if (v === undefined) return 'abort';
  if (typeof v === 'object') return 'retry';
  return v;
}

function fromKey(k: OnErrorKey, current: OnError | undefined): OnError {
  if (k === 'retry') {
    // Preserve existing retry count if already retry, else default to 3.
    const n =
      typeof current === 'object' && 'retry' in current ? current.retry : 3;
    return { retry: n, then: 'skip' };
  }
  return k;
}

/**
 * Right-side properties inspector for the selected block.
 *
 * For blocks inside the error handler track, `abort` is hidden from the
 * onError options (see docs/02-error-handling.md). Uses Base UI's Select
 * and Checkbox primitives via the thin wrappers in components/ui.
 */
export function Inspector({
  block,
  trackId,
  isErrorHandler,
  linkMode,
  resolveDepLabel,
  nodeManifest,
  scenarioVariables,
  availableContainers,
  onCreateVariable,
  onChange,
  onRemoveDep,
  onClose,
}: Props) {
  if (!block || !trackId) {
    return (
      <aside className="flex h-full w-72 flex-shrink-0 flex-col border-l border-fl-border bg-fl-panel p-4">
        <div className="font-mono text-[10px] text-fl-text-faint">
          ブロックを選択してプロパティを編集
        </div>
      </aside>
    );
  }
  const meta = BLOCK_META[block.type];
  const onErrorKey = toKey(block.onError);
  const hasTimeout = block.timeout !== undefined;

  // Action blocks can be bound to a Python node from the worker's
  // manifest. The panel is hidden for non-action block types since
  // loop/branch/sync/subroutine run inside the engine.
  const selectedNode = block.nodeId
    ? (nodeManifest.find((n) => n.id === block.nodeId) ?? null)
    : null;
  const nodeOptions: SelectOption<string>[] = [
    { value: '', label: '(未設定 / Mock で実行)' },
    ...nodeManifest.map((n) => ({
      value: n.id,
      label: `${n.category}/${n.label}`,
    })),
  ];

  const handleSelectNode = (nodeId: string): void => {
    if (!trackId) return;
    if (nodeId === '') {
      onChange(trackId, block.id, {
        nodeId: undefined,
        bindings: undefined,
        params: undefined,
      });
      return;
    }
    // Switching nodes: drop stale bindings/params since their ports
    // and param schema likely differ. The user re-binds on purpose.
    onChange(trackId, block.id, {
      nodeId,
      bindings: undefined,
      params: undefined,
    });
  };

  const handleBindingChange = (
    portName: string,
    binding: PortBinding | undefined,
  ): void => {
    if (!trackId) return;
    const next: Record<string, PortBinding> = { ...(block.bindings ?? {}) };
    if (binding === undefined) {
      delete next[portName];
    } else {
      next[portName] = binding;
    }
    onChange(trackId, block.id, {
      bindings: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  const handleParamChange = (
    paramName: string,
    value: string | number | boolean | undefined,
  ): void => {
    if (!trackId) return;
    const next = { ...(block.params ?? {}) } as Record<string, unknown>;
    if (value === undefined || value === '') delete next[paramName];
    else next[paramName] = value;
    onChange(trackId, block.id, {
      params: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  const onErrorOptions: SelectOption<OnErrorKey>[] = [
    ...(isErrorHandler
      ? []
      : [{ value: 'abort' as const, label: '中断 (abort)' }]),
    { value: 'skip', label: '次へ (skip)' },
    { value: 'ignore', label: '無視 (ignore)' },
    ...(isErrorHandler
      ? []
      : [{ value: 'retry' as const, label: 'リトライ (retry)' }]),
  ];

  const retryThenOptions: SelectOption<RetryThenKey>[] = [
    ...(isErrorHandler
      ? []
      : [{ value: 'abort' as const, label: 'abort' }]),
    { value: 'skip', label: 'skip' },
  ];

  return (
    <aside className="fl-scroll flex h-full w-72 flex-shrink-0 flex-col gap-3 overflow-y-auto border-l border-fl-border bg-fl-panel p-4">
      <div className="flex items-center justify-between">
        <div
          className="font-mono text-[10px] font-bold tracking-wider"
          style={{ color: meta.color }}
        >
          {meta.icon} {meta.label.toUpperCase()}
          {isErrorHandler && (
            <span className="ml-1 text-[#f43f5e]">/ エラー処理</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] text-fl-text-faint hover:text-fl-text"
        >
          ×
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">LABEL</span>
        <input
          value={block.label}
          onChange={(e) =>
            onChange(trackId, block.id, { label: e.target.value })
          }
          className="rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">SLOT</span>
        <input
          type="number"
          min={0}
          value={block.slot}
          onChange={(e) =>
            onChange(trackId, block.id, {
              slot: Math.max(0, Number(e.target.value)),
            })
          }
          className="rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none"
        />
      </label>

      {availableContainers.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] text-fl-text-faint">
            内包先
          </span>
          <Select<string>
            value={block.parentBlockId ?? ''}
            onValueChange={(v) => {
              if (v === '') {
                onChange(trackId, block.id, {
                  parentBlockId: undefined,
                  parentBranch: undefined,
                });
                return;
              }
              // Default the case label for multi-case containers
              // (branch / switch) to the first available lane;
              // loops don't use parentBranch at all.
              const target = availableContainers.find((c) => c.id === v);
              const defaultCase =
                target && target.cases.length > 1 ? target.cases[0] : undefined;
              onChange(trackId, block.id, {
                parentBlockId: v,
                parentBranch:
                  defaultCase === undefined
                    ? undefined
                    : target?.cases.includes(block.parentBranch ?? '')
                      ? block.parentBranch
                      : defaultCase,
              });
            }}
            options={[
              { value: '', label: '(なし)' },
              ...availableContainers.map((c) => ({
                value: c.id,
                label: `${
                  c.type === 'loop' ? '↻' : c.type === 'switch' ? '⧉' : '⑂'
                } ${c.label}`,
              })),
            ]}
          />
          {block.parentBlockId &&
            (() => {
              const parent = availableContainers.find(
                (c) => c.id === block.parentBlockId,
              );
              if (!parent || parent.cases.length <= 1) return null;
              return (
                <Select<string>
                  value={block.parentBranch ?? parent.cases[0]}
                  onValueChange={(side) =>
                    onChange(trackId, block.id, { parentBranch: side })
                  }
                  options={parent.cases.map((c) => ({
                    value: c,
                    label:
                      parent.type === 'branch'
                        ? c === 'then'
                          ? 'TRUE 側 (条件一致)'
                          : 'FALSE 側 (条件不一致)'
                        : c,
                  }))}
                />
              );
            })()}
          {block.parentBlockId && (
            <span className="font-mono text-[8px] text-fl-text-ghost">
              親コンテナのボディとして実行されます
            </span>
          )}
        </div>
      )}

      {block.type === 'loop' && (
        <LoopParamsSection
          block={block}
          scenarioVariables={scenarioVariables}
          onChange={(patch) => onChange(trackId, block.id, patch)}
        />
      )}

      {block.type === 'branch' && (
        <BranchParamsSection
          block={block}
          scenarioVariables={scenarioVariables}
          onChange={(patch) => onChange(trackId, block.id, patch)}
        />
      )}

      {block.type === 'switch' && (
        <SwitchParamsSection
          block={block}
          scenarioVariables={scenarioVariables}
          onChange={(patch) => onChange(trackId, block.id, patch)}
        />
      )}

      {block.type === 'action' && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] text-fl-text-faint">NODE</span>
          <Select<string>
            value={block.nodeId ?? ''}
            onValueChange={handleSelectNode}
            options={nodeOptions}
          />
          {nodeManifest.length === 0 && (
            <span className="font-mono text-[9px] text-fl-text-ghost">
              Python ランタイム未接続 — Mock で実行されます
            </span>
          )}
          {selectedNode && (
            <span
              className="font-mono text-[9px] text-fl-text-dim"
              title={selectedNode.id}
            >
              {selectedNode.id} · v{selectedNode.version}
            </span>
          )}
        </div>
      )}

      {block.type === 'action' && selectedNode && (
        <NodePortsSection
          node={selectedNode}
          bindings={block.bindings ?? {}}
          scenarioVariables={scenarioVariables}
          onBindingChange={handleBindingChange}
          onCreateVariable={onCreateVariable}
        />
      )}

      {block.type === 'action' && selectedNode && (
        <NodeParamsSection
          node={selectedNode}
          params={(block.params as Record<string, unknown>) ?? {}}
          onParamChange={handleParamChange}
        />
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 font-mono text-[10px] text-fl-text-muted">
          <Checkbox
            checked={!!block.skipIfMissing}
            onCheckedChange={(v) =>
              onChange(trackId, block.id, {
                skipIfMissing: v || undefined,
              })
            }
            accent="#eab308"
          />
          ターゲットが見つからなくてもOK
        </div>
        <span className="pl-5 font-mono text-[9px] text-fl-text-ghost">
          （想定内の不在は静かにスキップ）
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between font-mono text-[9px] text-fl-text-faint">
          <span>TIMEOUT (秒)</span>
          <div className="flex items-center gap-1 text-[9px] text-fl-text-dim">
            <Checkbox
              checked={hasTimeout}
              onCheckedChange={(v) =>
                onChange(trackId, block.id, {
                  timeout: v ? 30 : undefined,
                })
              }
              accent="#06b6d4"
            />
            個別設定
          </div>
        </div>
        <input
          type="number"
          min={1}
          disabled={!hasTimeout}
          value={block.timeout ?? ''}
          placeholder="engine default"
          onChange={(e) =>
            onChange(trackId, block.id, {
              timeout: e.target.value
                ? Math.max(1, Number(e.target.value))
                : undefined,
            })
          }
          className="rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none disabled:opacity-40"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">ON ERROR</span>
        <Select<OnErrorKey>
          value={onErrorKey}
          onValueChange={(k) =>
            onChange(trackId, block.id, {
              onError: fromKey(k, block.onError),
            })
          }
          options={onErrorOptions}
        />
        {isErrorHandler && (
          <span className="font-mono text-[9px] text-[#f43f5e88]">
            エラー処理内では abort / retry は無効
          </span>
        )}
        {onErrorKey === 'retry' && typeof block.onError === 'object' && (
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-fl-text-dim">
            <input
              type="number"
              min={1}
              max={20}
              value={block.onError.retry}
              onChange={(e) =>
                onChange(trackId, block.id, {
                  onError: {
                    retry: Math.max(1, Number(e.target.value)),
                    then: (block.onError as { then: RetryThenKey }).then,
                  },
                })
              }
              className="w-12 rounded border border-fl-border-strong bg-fl-panel-2 px-1 py-0.5 text-center font-mono text-[10px] text-fl-text outline-none"
            />
            回 →
            <div className="flex-1">
              <Select<RetryThenKey>
                value={block.onError.then}
                onValueChange={(then) =>
                  onChange(trackId, block.id, {
                    onError: {
                      retry: (block.onError as { retry: number }).retry,
                      then,
                    },
                  })
                }
                options={retryThenOptions}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">DEPS (DAG)</span>
        {block.deps.length === 0 ? (
          <div className="rounded-md border border-fl-border-2 bg-fl-bg px-2 py-1 font-mono text-[10px] text-fl-text-ghost">
            (none)
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {block.deps.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 rounded border border-fl-border-2 bg-fl-bg px-1.5 py-0.5 font-mono text-[9px] text-fl-text-muted"
              >
                {resolveDepLabel(d)}
                <button
                  type="button"
                  onClick={() => onRemoveDep(trackId, block.id, d)}
                  className="text-fl-text-faint hover:text-red-500"
                  title="依存を削除"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <span className="font-mono text-[8px] leading-relaxed text-fl-text-ghost">
          {linkMode
            ? '依存リンクモード: 他のブロックをクリックして追加'
            : 'ツールバーの「依存リンク」モードで追加'}
        </span>
      </div>

      <div className="mt-auto font-mono text-[9px] text-fl-text-ghost">
        id: {block.id}
      </div>
    </aside>
  );
}

// ──────────────────────────────────────────────────────────────────
// Loop / branch built-in control-flow editors
// ──────────────────────────────────────────────────────────────────

interface LoopParamsProps {
  block: Block;
  scenarioVariables: Record<string, unknown>;
  onChange: (patch: Partial<Block>) => void;
}

/**
 * Loop body editor. Two modes:
 *
 * - **回数**  — ``params.iterations`` (integer, default 1). The
 *   executor runs the body exactly that many times.
 * - **条件** — ``params.whileCondition`` is a JSON Logic expression
 *   the executor re-evaluates before each iteration. The body runs
 *   while the expression is truthy, capped internally so a broken
 *   predicate can't hang the run.
 *
 * The current mode is inferred from which field is set. Switching
 * modes from the UI clears the other field so only one source of
 * truth lives on the block at a time.
 */
function LoopParamsSection({
  block,
  scenarioVariables,
  onChange,
}: LoopParamsProps) {
  const params =
    (block.params as Record<string, unknown> | undefined) ?? {};
  const hasWhile = params.whileCondition !== undefined;
  const mode: 'count' | 'while' = hasWhile ? 'while' : 'count';

  const iterations =
    typeof params.iterations === 'number' &&
    Number.isFinite(params.iterations) &&
    (params.iterations as number) > 0
      ? Math.floor(params.iterations as number)
      : 1;

  const setMode = (next: 'count' | 'while') => {
    if (next === mode) return;
    const nextParams: Record<string, unknown> = { ...params };
    if (next === 'count') {
      delete nextParams.whileCondition;
      if (nextParams.iterations === undefined) nextParams.iterations = 1;
    } else {
      delete nextParams.iterations;
    }
    onChange({
      params: Object.keys(nextParams).length > 0 ? nextParams : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">
          ループ
        </span>
        <div className="ml-auto flex overflow-hidden rounded border border-fl-border-2">
          <button
            type="button"
            onClick={() => setMode('count')}
            className="px-1.5 py-0.5 font-mono text-[9px] transition-colors"
            style={{
              background: mode === 'count' ? '#8b5cf622' : 'transparent',
              color: mode === 'count' ? '#a78bfa' : 'var(--fl-text-ghost)',
            }}
          >
            回数
          </button>
          <button
            type="button"
            onClick={() => setMode('while')}
            className="px-1.5 py-0.5 font-mono text-[9px] transition-colors"
            style={{
              background: mode === 'while' ? '#8b5cf622' : 'transparent',
              color: mode === 'while' ? '#a78bfa' : 'var(--fl-text-ghost)',
            }}
          >
            条件
          </button>
        </div>
      </div>
      {mode === 'count' ? (
        <>
          <input
            type="number"
            min={1}
            max={10_000}
            value={iterations}
            onChange={(e) => {
              const n = Math.max(
                1,
                Math.floor(Number(e.target.value) || 1),
              );
              const next: Record<string, unknown> = { ...params };
              next.iterations = n;
              onChange({ params: next });
            }}
            className="rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none"
          />
          <span className="font-mono text-[8px] text-fl-text-ghost">
            内包ブロックを上記回数くりかえします
          </span>
        </>
      ) : (
        <>
          <ConditionBuilder
            value={params.whileCondition}
            scenarioVariables={scenarioVariables}
            placeholder="真の間くりかえし"
            onChange={(next) => {
              const nextParams: Record<string, unknown> = { ...params };
              if (next === undefined) {
                delete nextParams.whileCondition;
              } else {
                nextParams.whileCondition = next;
              }
              onChange({
                params:
                  Object.keys(nextParams).length > 0 ? nextParams : undefined,
              });
            }}
          />
          <span className="font-mono text-[8px] text-fl-text-ghost">
            条件が真の間くりかえします (最大 10,000 回)
          </span>
        </>
      )}
      <span className="font-mono text-[8px] text-fl-text-ghost">
        反復中は <span className="text-fl-text-dim">track.&lt;id&gt;.loop_index</span>
        &nbsp;が 0 始まりで更新されます
      </span>
    </div>
  );
}

interface BranchParamsProps {
  block: Block;
  scenarioVariables: Record<string, unknown>;
  onChange: (patch: Partial<Block>) => void;
}

/**
 * Branch condition editor — now backed by ConditionBuilder. The
 * user typically constructs their condition visually, but
 * arbitrarily complex JSON Logic expressions can still be authored
 * via the raw textarea fallback inside the builder.
 */
function BranchParamsSection({
  block,
  scenarioVariables,
  onChange,
}: BranchParamsProps) {
  const params =
    (block.params as Record<string, unknown> | undefined) ?? {};
  const current = params.condition;
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] text-fl-text-faint">条件</span>
      <ConditionBuilder
        value={current}
        scenarioVariables={scenarioVariables}
        onChange={(next) => {
          const nextParams: Record<string, unknown> = { ...params };
          if (next === undefined) {
            delete nextParams.condition;
          } else {
            nextParams.condition = next;
          }
          onChange({
            params:
              Object.keys(nextParams).length > 0 ? nextParams : undefined,
          });
        }}
      />
      <span className="font-mono text-[8px] leading-relaxed text-fl-text-ghost">
        TRUE 側 / FALSE 側 の分岐は内包ブロックのバッジで指定します
      </span>
    </div>
  );
}

interface SwitchExpressionEditorProps {
  value: unknown;
  scenarioVariables: Record<string, unknown>;
  onChange: (next: unknown) => void;
}

/**
 * Compact editor for a switch's evaluation expression. The common
 * case is a plain variable reference (``{ var: "scenario.status" }``),
 * so the default mode is a single-line text input with a datalist
 * of scenario variable keys — the user types ``scenario.status`` and
 * the widget serialises to the right JSON Logic shape.
 *
 * A 詳細 toggle exposes a raw JSON textarea for arbitrary
 * expressions (arithmetic, nested ops) that don't fit the simple
 * var shape. Switching modes preserves the current value whenever
 * possible.
 */
function SwitchExpressionEditor({
  value,
  scenarioVariables,
  onChange,
}: SwitchExpressionEditorProps) {
  // Detect whether the current value is a simple var reference.
  // Everything else forces raw mode on mount.
  const asVar =
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 1 &&
    (value as Record<string, unknown>).var !== undefined
      ? String((value as { var: unknown }).var)
      : null;
  const canBuildMode = asVar !== null || value === undefined;
  const [rawForced, setRawForced] = useState(!canBuildMode);
  const raw = rawForced || !canBuildMode;

  const [localVar, setLocalVar] = useState(asVar ?? '');
  const [localRaw, setLocalRaw] = useState(
    value === undefined ? '' : JSON.stringify(value, null, 2),
  );
  const [rawError, setRawError] = useState<string | null>(null);

  // Resync when the external value changes identity.
  const identity = JSON.stringify(value ?? null);
  useEffect(() => {
    setLocalVar(asVar ?? '');
    setLocalRaw(value === undefined ? '' : JSON.stringify(value, null, 2));
    setRawError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  const knownKeys = Object.keys(scenarioVariables)
    .sort()
    .map((k) => `scenario.${k}`);

  const commitVar = () => {
    const trimmed = localVar.trim();
    if (trimmed === '') {
      onChange(undefined);
      return;
    }
    onChange({ var: trimmed });
  };

  const commitRaw = () => {
    const trimmed = localRaw.trim();
    if (trimmed === '') {
      onChange(undefined);
      setRawError(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      onChange(parsed);
      setRawError(null);
    } catch (e) {
      setRawError((e as Error).message);
    }
  };

  if (raw) {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          value={localRaw}
          onChange={(e) => setLocalRaw(e.target.value)}
          onBlur={commitRaw}
          spellCheck={false}
          rows={3}
          placeholder='{ "var": "scenario.status" }'
          className="resize-none rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[10px] leading-relaxed text-fl-text outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          {rawError ? (
            <span className="flex-1 font-mono text-[9px] text-[#ef4444]">
              {rawError}
            </span>
          ) : (
            <span className="flex-1 font-mono text-[8px] text-fl-text-ghost">
              生の JSON Logic 式を入力
            </span>
          )}
          {canBuildMode && (
            <button
              type="button"
              onClick={() => setRawForced(false)}
              className="font-mono text-[8px] text-fl-text-ghost hover:text-fl-text-faint"
            >
              ‹ シンプル
            </button>
          )}
        </div>
      </div>
    );
  }

  const datalistId = 'switch-expr-vars';
  return (
    <div className="flex items-center gap-1">
      <input
        value={localVar}
        onChange={(e) => setLocalVar(e.target.value)}
        onBlur={commitVar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="scenario.xxx"
        list={datalistId}
        className="min-w-0 flex-1 rounded border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none focus:border-[#3b82f6]"
      />
      <datalist id={datalistId}>
        {knownKeys.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={() => setRawForced(true)}
        className="flex-shrink-0 font-mono text-[8px] text-fl-text-ghost hover:text-fl-text-faint"
        title="JSON Logic 式を直接編集"
      >
        詳細 ›
      </button>
    </div>
  );
}

interface SwitchParamsProps {
  block: Block;
  scenarioVariables: Record<string, unknown>;
  onChange: (patch: Partial<Block>) => void;
}

/**
 * Switch block editor.
 *
 * The switch evaluates ``params.expression`` (any JSON Logic) and
 * runs the children whose ``parentBranch`` matches the first
 * winning case from ``params.cases`` (string[]). A conventional
 * ``"default"`` entry acts as the fallback.
 *
 * The UI gives you a ConditionBuilder-free expression editor (raw
 * JSON textarea — most switches key off a single ``{ "var": "..." }``
 * so a full ConditionBuilder is overkill here) and a case list
 * you can add/rename/reorder/remove. Deleting a case cleans up
 * ``parentBranch`` on children through the same onChange call site
 * so orphaned lanes can't survive a rename. The first case in the
 * list becomes the default lane new children land on.
 */
function SwitchParamsSection({
  block,
  scenarioVariables,
  onChange,
}: SwitchParamsProps) {
  const params =
    (block.params as Record<string, unknown> | undefined) ?? {};
  const cases: string[] = Array.isArray(params.cases)
    ? (params.cases as unknown[]).map((c) => String(c))
    : [];

  const commitExpression = (next: unknown) => {
    const nextParams: Record<string, unknown> = { ...params };
    if (next === undefined) {
      delete nextParams.expression;
    } else {
      nextParams.expression = next;
    }
    onChange({
      params: Object.keys(nextParams).length > 0 ? nextParams : undefined,
    });
  };

  const commitCases = (nextCases: string[]) => {
    const nextParams: Record<string, unknown> = { ...params };
    nextParams.cases = nextCases;
    onChange({ params: nextParams });
  };

  const updateCase = (idx: number, next: string) => {
    const trimmed = next.trim();
    if (trimmed === '') return;
    if (cases.some((c, i) => i !== idx && c === trimmed)) return;
    const nextCases = cases.slice();
    nextCases[idx] = trimmed;
    commitCases(nextCases);
  };

  const addCase = () => {
    // Generate a unique default name so repeated clicks don't collide.
    let i = cases.length;
    let candidate = `case_${i}`;
    while (cases.includes(candidate)) {
      i++;
      candidate = `case_${i}`;
    }
    commitCases([...cases, candidate]);
  };

  const addDefault = () => {
    if (cases.includes('default')) return;
    commitCases([...cases, 'default']);
  };

  const deleteCase = (idx: number) => {
    commitCases(cases.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">評価式</span>
        <SwitchExpressionEditor
          value={params.expression}
          scenarioVariables={scenarioVariables}
          onChange={commitExpression}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-fl-text-faint">
            ケース一覧
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={addCase}
              className="rounded border border-fl-border-2 bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[9px] text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text"
            >
              + case
            </button>
            <button
              type="button"
              onClick={addDefault}
              disabled={cases.includes('default')}
              className="rounded border border-fl-border-2 bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[9px] text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text disabled:opacity-40"
            >
              + default
            </button>
          </div>
        </div>
        {cases.length === 0 && (
          <span className="font-mono text-[9px] text-fl-text-ghost">
            `+ case` で最初のケースを追加
          </span>
        )}
        {cases.map((c, i) => (
          <SwitchCaseRow
            key={`${c}-${i}`}
            value={c}
            onCommit={(next) => updateCase(i, next)}
            onDelete={() => deleteCase(i)}
          />
        ))}
      </div>
      <span className="font-mono text-[8px] leading-relaxed text-fl-text-ghost">
        評価式の値と一致したケースの内包ブロックを実行します。
        どれにも一致しなければ <span className="text-fl-text-dim">default</span> のブロックが実行されます
      </span>
    </div>
  );
}

interface SwitchCaseRowProps {
  value: string;
  onCommit: (next: string) => void;
  onDelete: () => void;
}

function SwitchCaseRow({ value, onCommit, onDelete }: SwitchCaseRowProps) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <div className="flex items-center gap-1">
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onCommit(local);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setLocal(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="min-w-0 flex-1 rounded border border-fl-border-2 bg-fl-bg px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none"
      />
      <button
        type="button"
        onClick={onDelete}
        className="text-fl-text-faint transition-colors hover:text-red-500"
        title="ケースを削除"
      >
        ×
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Node sub-sections (ports + params)
// ──────────────────────────────────────────────────────────────────

interface PortsSectionProps {
  node: NodeManifestEntry;
  bindings: Record<string, PortBinding>;
  scenarioVariables: Record<string, unknown>;
  onBindingChange: (portName: string, binding: PortBinding | undefined) => void;
  onCreateVariable: (key: string, value: unknown) => void;
}

/**
 * Ports panel: lists each in / out port the selected node declares
 * and lets the user either bind it to a scenario variable (picker
 * + create-missing helper) or drop a literal value directly on the
 * block. See docs/03-nodes.md (rev2).
 *
 * In-ports: toggle between "変数" and "値" modes. Var mode shows
 * the scenario-var picker + a "+ 作成" shortcut for names that
 * don't exist yet. Literal mode shows a type-agnostic text input
 * parsed with valueLiteral.parseLiteral.
 *
 * Out-ports: always var-bound (literal output makes no sense), so
 * we only render the picker + create helper.
 */
function NodePortsSection({
  node,
  bindings,
  scenarioVariables,
  onBindingChange,
  onCreateVariable,
}: PortsSectionProps) {
  const portEntries = Object.entries(node.ports);
  if (portEntries.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">PORTS</span>
        <div className="rounded-md border border-fl-border-2 bg-fl-bg px-2 py-1 font-mono text-[10px] text-fl-text-ghost">
          (no ports)
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] text-fl-text-faint">PORTS</span>
      <div className="flex flex-col gap-2">
        {portEntries.map(([portName, def]) => (
          <PortRow
            key={portName}
            name={portName}
            def={def}
            binding={bindings[portName]}
            scenarioVariables={scenarioVariables}
            onChange={(next) => onBindingChange(portName, next)}
            onCreateVariable={onCreateVariable}
          />
        ))}
      </div>
    </div>
  );
}

interface PortRowProps {
  name: string;
  def: NodePortDef;
  binding: PortBinding | undefined;
  scenarioVariables: Record<string, unknown>;
  onChange: (next: PortBinding | undefined) => void;
  onCreateVariable: (key: string, value: unknown) => void;
}

function PortRow({
  name,
  def,
  binding,
  scenarioVariables,
  onChange,
  onCreateVariable,
}: PortRowProps) {
  const kindColor = def.kind === 'in' ? '#60a5fa' : '#22c55e';
  const kindLabel = def.kind === 'in' ? '←' : '→';

  // Header (arrow + port name + type hint)
  const header = (
    <div className="flex items-center gap-1.5">
      <span
        className="flex-shrink-0 font-mono text-[10px] font-bold"
        style={{ color: kindColor }}
        title={def.kind === 'in' ? '入力ポート' : '出力ポート'}
      >
        {kindLabel}
      </span>
      <span
        className="flex-1 truncate font-mono text-[10px] text-fl-text-dim"
        title={`${name}${def.type ? ` : ${def.type}` : ''}${def.required ? ' *' : ''}`}
      >
        {name}
        {def.required && <span className="text-[#f59e0b]">*</span>}
      </span>
      {def.type && (
        <span className="flex-shrink-0 font-mono text-[8px] text-fl-text-ghost">
          {def.type}
        </span>
      )}
    </div>
  );

  // Out-ports: var-only editor
  if (def.kind === 'out') {
    return (
      <div className="flex flex-col gap-1">
        {header}
        <VariableField
          value={binding?.kind === 'var' ? binding.key : ''}
          scenarioVariables={scenarioVariables}
          onCommit={(key) =>
            onChange(key ? { kind: 'var', key } : undefined)
          }
          onCreateVariable={onCreateVariable}
        />
      </div>
    );
  }

  // In-ports: var / literal toggle + type-appropriate editor
  const mode: 'var' | 'literal' = binding?.kind ?? 'var';
  const switchMode = (next: 'var' | 'literal') => {
    if (next === mode) return;
    if (next === 'var') {
      onChange({ kind: 'var', key: '' });
    } else {
      onChange({ kind: 'literal', value: '' });
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {header}
      <div className="flex items-center gap-1">
        <ModeToggle mode={mode} onChange={switchMode} />
        <div className="min-w-0 flex-1">
          {mode === 'var' ? (
            <VariableField
              value={binding?.kind === 'var' ? binding.key : ''}
              scenarioVariables={scenarioVariables}
              onCommit={(key) =>
                onChange(key ? { kind: 'var', key } : undefined)
              }
              onCreateVariable={onCreateVariable}
            />
          ) : (
            <LiteralField
              value={binding?.kind === 'literal' ? binding.value : undefined}
              onCommit={(value) => onChange({ kind: 'literal', value })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mode toggle ──────────────────────────────────────────────────

interface ModeToggleProps {
  mode: 'var' | 'literal';
  onChange: (next: 'var' | 'literal') => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const btnCls =
    'px-1.5 py-0.5 font-mono text-[9px] transition-colors';
  return (
    <div className="flex flex-shrink-0 overflow-hidden rounded border border-fl-border-2">
      <button
        type="button"
        onClick={() => onChange('var')}
        className={btnCls}
        style={{
          background: mode === 'var' ? '#3b82f622' : 'transparent',
          color:
            mode === 'var' ? '#60a5fa' : 'var(--fl-text-ghost)',
        }}
        title="シナリオ変数を参照"
      >
        変数
      </button>
      <button
        type="button"
        onClick={() => onChange('literal')}
        className={btnCls}
        style={{
          background: mode === 'literal' ? '#3b82f622' : 'transparent',
          color:
            mode === 'literal' ? '#60a5fa' : 'var(--fl-text-ghost)',
        }}
        title="値を直接指定"
      >
        値
      </button>
    </div>
  );
}

// ── Variable field (picker + create helper) ─────────────────────

interface VariableFieldProps {
  value: string;
  scenarioVariables: Record<string, unknown>;
  onCommit: (key: string) => void;
  onCreateVariable: (key: string, value: unknown) => void;
}

/**
 * Editor for a `var`-kind binding. The user types a fully-qualified
 * key (e.g. `scenario.target`) and the field is live-checked against
 * the scenario variable store. If the key is a `scenario.*` name that
 * doesn't exist yet, a "+ 作成" button appears — clicking it creates
 * the variable with a null initial value and commits the binding.
 *
 * We only offer auto-create for scenario-scoped keys because track
 * variables aren't yet surfaced in any UI.
 */
function VariableField({
  value,
  scenarioVariables,
  onCommit,
  onCreateVariable,
}: VariableFieldProps) {
  const [local, setLocal] = useState(value);

  // Resync when the external binding identity changes.
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const scenarioKey =
    local.startsWith('scenario.') && local.length > 'scenario.'.length
      ? local.slice('scenario.'.length)
      : null;
  const existsInStore =
    scenarioKey !== null && scenarioKey in scenarioVariables;
  const canCreate =
    scenarioKey !== null && !existsInStore && scenarioKey.trim() !== '';

  const commit = () => {
    const trimmed = local.trim();
    if (trimmed === value) return;
    onCommit(trimmed);
  };

  const handleCreate = () => {
    if (!scenarioKey) return;
    onCreateVariable(scenarioKey, null);
    // Commit the binding so the UI reflects the new link immediately.
    onCommit(local.trim());
  };

  // Known variable names for the datalist (autocomplete suggestions).
  const datalistId = `flowline-vars-${Math.abs(hashString(value || local))}`;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setLocal(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="scenario.xxx"
        list={datalistId}
        className="min-w-0 flex-1 rounded border border-fl-border-2 bg-fl-bg px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-fl-text-dim"
      />
      <datalist id={datalistId}>
        {Object.keys(scenarioVariables).map((k) => (
          <option key={k} value={`scenario.${k}`} />
        ))}
      </datalist>
      {canCreate && (
        <button
          type="button"
          onClick={handleCreate}
          className="flex-shrink-0 rounded border border-[#22c55e] bg-[#22c55e18] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#22c55e] transition-colors hover:bg-[#22c55e30]"
          title={`scenario.${scenarioKey} を新規作成`}
        >
          + 作成
        </button>
      )}
    </div>
  );
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ── Literal field ────────────────────────────────────────────────

interface LiteralFieldProps {
  value: unknown;
  onCommit: (next: unknown) => void;
}

/**
 * Editor for a `literal`-kind binding. Type-agnostic: the user types
 * whatever they want and we parse it with the shared value-literal
 * helper. The same rules that govern VariablesModal apply here so
 * the experience is consistent (numbers, booleans, JSON, string
 * fallback).
 */
function LiteralField({ value, onCommit }: LiteralFieldProps) {
  const [local, setLocal] = useState<string>(() => formatLiteral(value));

  // Resync when the external binding identity changes.
  const valueKey = formatLiteral(value);
  useEffect(() => {
    setLocal(valueKey);
  }, [valueKey]);

  const commit = () => {
    const parsed = parseLiteral(local);
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      placeholder='"hello" / 42 / true / {"x":1}'
      className="w-full rounded border border-fl-border-2 bg-fl-bg px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-fl-text-dim"
    />
  );
}

interface ParamsSectionProps {
  node: NodeManifestEntry;
  params: Record<string, unknown>;
  onParamChange: (
    paramName: string,
    value: string | number | boolean | undefined,
  ) => void;
}

/**
 * Params panel: renders an editor per param declared by the node's
 * ``@node(params=...)`` decorator. Schema is extremely simple — we
 * support enum / number / boolean / string for now; anything else
 * falls back to a plain text input. The value sent on the wire is
 * ``block.params[key]`` which overlays the decorator's ``default``
 * inside the worker.
 */
function NodeParamsSection({
  node,
  params,
  onParamChange,
}: ParamsSectionProps) {
  const entries = Object.entries(node.params);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] text-fl-text-faint">PARAMS</span>
      <div className="flex flex-col gap-1.5">
        {entries.map(([key, rawMeta]) => {
          const meta = (rawMeta ?? {}) as {
            type?: string;
            default?: unknown;
            choices?: string[];
          };
          const current = params[key];
          const effective = current !== undefined ? current : meta.default;
          const overridden = current !== undefined;
          return (
            <ParamRow
              key={key}
              name={key}
              type={meta.type}
              choices={meta.choices}
              value={effective}
              overridden={overridden}
              onChange={(v) => onParamChange(key, v)}
              onReset={() => onParamChange(key, undefined)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ParamRowProps {
  name: string;
  type: string | undefined;
  choices: string[] | undefined;
  value: unknown;
  overridden: boolean;
  onChange: (v: string | number | boolean | undefined) => void;
  onReset: () => void;
}

function ParamRow({
  name,
  type,
  choices,
  value,
  overridden,
  onChange,
  onReset,
}: ParamRowProps) {
  const common = 'min-w-0 flex-1 rounded border bg-fl-bg px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none focus:border-fl-text-dim';
  const borderCls = overridden
    ? 'border-[#3b82f6]'
    : 'border-fl-border-2';

  let control: React.ReactNode;
  if (type === 'enum' && choices && choices.length > 0) {
    const opts: SelectOption<string>[] = choices.map((c) => ({
      value: c,
      label: c,
    }));
    control = (
      <div className="min-w-0 flex-1">
        <Select<string>
          value={typeof value === 'string' ? value : (choices[0] ?? '')}
          onValueChange={(v) => onChange(v)}
          options={opts}
        />
      </div>
    );
  } else if (type === 'number') {
    control = (
      <input
        type="number"
        value={
          value === undefined || value === null
            ? ''
            : typeof value === 'number'
              ? value
              : String(value)
        }
        onChange={(e) =>
          onChange(e.target.value === '' ? undefined : Number(e.target.value))
        }
        className={`${common} ${borderCls}`}
      />
    );
  } else if (type === 'boolean') {
    control = (
      <div className="flex flex-1 items-center">
        <Checkbox
          checked={value === true}
          onCheckedChange={(v) => onChange(v)}
          accent="#3b82f6"
        />
      </div>
    );
  } else {
    control = (
      <input
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) =>
          onChange(e.target.value === '' ? undefined : e.target.value)
        }
        className={`${common} ${borderCls}`}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="flex-shrink-0 truncate font-mono text-[10px] text-fl-text-dim"
        style={{ width: 76 }}
        title={`${name}${type ? ` : ${type}` : ''}`}
      >
        {name}
      </span>
      {control}
      {overridden && (
        <button
          type="button"
          onClick={onReset}
          title="デフォルトに戻す"
          className="flex-shrink-0 font-mono text-[9px] text-fl-text-faint hover:text-fl-text"
        >
          ↺
        </button>
      )}
    </div>
  );
}
