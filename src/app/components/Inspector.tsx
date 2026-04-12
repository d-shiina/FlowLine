import type { Block, OnError, PortBinding } from '../types';
import { BLOCK_META } from '../types';
import type { NodeManifestEntry } from '../../globals';
import { Select, type SelectOption } from './ui/Select';
import { Checkbox } from './ui/Checkbox';
import {
  LoopParamsSection,
  BranchParamsSection,
  SwitchParamsSection,
} from './inspector/ControlFlowSections';
import { NodePortsSection, NodeParamsSection } from './inspector/NodeSection';

interface Props {
  block: Block | null;
  trackId: string | null;
  isErrorHandler: boolean;
  nodeManifest: NodeManifestEntry[];
  scenarioVariables: Record<string, unknown>;
  parentContainerCases: string[] | null;
  parentContainerType: 'loop' | 'branch' | 'switch' | null;
  onCreateVariable: (key: string, value: unknown) => void;
  onChange: (trackId: string, blockId: string, patch: Partial<Block>) => void;
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
    const n =
      typeof current === 'object' && 'retry' in current ? current.retry : 3;
    return { retry: n, then: 'skip' };
  }
  return k;
}

/**
 * Right-side properties inspector for the selected block.
 *
 * This file is the thin facade — per-block-type sub-editors live in
 * ``inspector/ControlFlowSections.tsx`` (loop / branch / switch
 * params) and ``inspector/NodeSection.tsx`` (Python node ports +
 * params). The facade owns shared concerns: label / slot / lane
 * picker / error-handling / timeout.
 */
export function Inspector({
  block,
  trackId,
  isErrorHandler,
  nodeManifest,
  scenarioVariables,
  parentContainerCases,
  parentContainerType,
  onCreateVariable,
  onChange,
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
    if (nodeId === '') {
      onChange(trackId, block.id, {
        nodeId: undefined,
        bindings: undefined,
        params: undefined,
      });
      return;
    }
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

      {parentContainerCases && parentContainerCases.length > 1 && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] text-fl-text-faint">
            内包レーン
          </span>
          <Select<string>
            value={block.parentBranch ?? parentContainerCases[0]}
            onValueChange={(side) =>
              onChange(trackId, block.id, { parentBranch: side })
            }
            options={parentContainerCases.map((c) => ({
              value: c,
              label:
                parentContainerType === 'branch'
                  ? c === 'then'
                    ? 'TRUE 側 (条件一致)'
                    : 'FALSE 側 (条件不一致)'
                  : c,
            }))}
          />
          <span className="font-mono text-[8px] text-fl-text-ghost">
            親コンテナをドラッグで変更
          </span>
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

      <div className="mt-auto font-mono text-[9px] text-fl-text-ghost">
        id: {block.id}
      </div>
    </aside>
  );
}
