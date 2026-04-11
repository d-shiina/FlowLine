import type { Block, OnError } from '../types';
import { BLOCK_META } from '../types';
import type { NodeManifestEntry, NodePortDef } from '../../globals';
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

  const handleBindingChange = (portName: string, varKey: string): void => {
    if (!trackId) return;
    const next = { ...(block.bindings ?? {}) };
    if (varKey.trim() === '') delete next[portName];
    else next[portName] = varKey.trim();
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
          onBindingChange={handleBindingChange}
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
// Node sub-sections (ports + params)
// ──────────────────────────────────────────────────────────────────

interface PortsSectionProps {
  node: NodeManifestEntry;
  bindings: Record<string, string>;
  onBindingChange: (portName: string, varKey: string) => void;
}

/**
 * Ports panel: lists each in / out port the selected node declares
 * and lets the user bind it to a scenario-wide variable path like
 * `scenario.target`. In-ports are resolved before run_node by
 * IpcRuntime; out-ports are reflected back into the variable store
 * after the result returns. See docs/03-nodes.md (rev2).
 */
function NodePortsSection({
  node,
  bindings,
  onBindingChange,
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
      <div className="flex flex-col gap-1.5">
        {portEntries.map(([portName, def]) => (
          <PortRow
            key={portName}
            name={portName}
            def={def}
            value={bindings[portName] ?? ''}
            onChange={(v) => onBindingChange(portName, v)}
          />
        ))}
      </div>
      <span className="font-mono text-[8px] leading-relaxed text-fl-text-ghost">
        例: scenario.target / track.loop_index
      </span>
    </div>
  );
}

interface PortRowProps {
  name: string;
  def: NodePortDef;
  value: string;
  onChange: (next: string) => void;
}

function PortRow({ name, def, value, onChange }: PortRowProps) {
  const kindColor = def.kind === 'in' ? '#60a5fa' : '#22c55e';
  const kindLabel = def.kind === 'in' ? '←' : '→';
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="flex-shrink-0 font-mono text-[9px] font-bold"
        style={{ color: kindColor, width: 10 }}
        title={def.kind === 'in' ? '入力ポート' : '出力ポート'}
      >
        {kindLabel}
      </span>
      <span
        className="flex-shrink-0 truncate font-mono text-[10px] text-fl-text-dim"
        style={{ width: 64 }}
        title={`${name}${def.type ? ` : ${def.type}` : ''}${def.required ? ' *' : ''}`}
      >
        {name}
        {def.required && <span className="text-[#f59e0b]">*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="(unbound)"
        className="min-w-0 flex-1 rounded border border-fl-border-2 bg-fl-bg px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-fl-text-dim"
      />
    </div>
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
