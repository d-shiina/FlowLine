import { useMemo, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import {
  STEP_META,
  type Step,
  type StepType,
  type Subroutine,
} from '../types';
import type { NodeManifestEntry } from '../../globals';
import { uid } from '../useScenario';
import { Select, type SelectOption } from './ui/Select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockLabel: string;
  nextOrder: number;
  parentStepId?: string;
  subroutines: Subroutine[];
  nodeManifest: NodeManifestEntry[];
  onAdd: (step: Step) => void;
}

type Mode = 'node' | 'control' | 'subroutine';

const CONTROL_TYPES: Array<{ type: StepType; label: string; icon: string; color: string }> = [
  { type: 'loop', label: 'ループ', icon: '↻', color: '#8B5CF6' },
  { type: 'branch', label: '分岐', icon: '⑂', color: '#F59E0B' },
  { type: 'switch', label: 'スイッチ', icon: '⧉', color: '#EC4899' },
  { type: 'group', label: 'グループ', icon: '▤', color: '#6B7280' },
  { type: 'wait', label: '待機', icon: '⏸', color: '#06B6D4' },
];

function defaultParams(type: StepType): Record<string, unknown> | undefined {
  if (type === 'switch') return { cases: ['case_0', 'case_1', 'default'] };
  return undefined;
}

export function AddStepModal({
  open,
  onOpenChange,
  blockLabel,
  nextOrder,
  parentStepId,
  subroutines,
  nodeManifest,
  onAdd,
}: Props) {
  const [mode, setMode] = useState<Mode>('node');
  const [search, setSearch] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [controlType, setControlType] = useState<StepType>('loop');
  const [customLabel, setCustomLabel] = useState('');
  const [subroutineId, setSubroutineId] = useState('');

  // Group nodes by category.
  const groupedNodes = useMemo(() => {
    const groups = new Map<string, NodeManifestEntry[]>();
    for (const node of nodeManifest) {
      const cat = node.category || 'other';
      const arr = groups.get(cat) ?? [];
      arr.push(node);
      groups.set(cat, arr);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [nodeManifest]);

  // Filter nodes by search.
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groupedNodes;
    const q = search.toLowerCase();
    return groupedNodes
      .map(([cat, nodes]) => [
        cat,
        nodes.filter(
          (n) =>
            n.label.toLowerCase().includes(q) ||
            n.id.toLowerCase().includes(q) ||
            (n.labels.ja ?? '').toLowerCase().includes(q) ||
            cat.toLowerCase().includes(q),
        ),
      ] as [string, NodeManifestEntry[]])
      .filter(([, nodes]) => nodes.length > 0);
  }, [groupedNodes, search]);

  const selectedNode = selectedNodeId
    ? nodeManifest.find((n) => n.id === selectedNodeId)
    : null;

  const handleAdd = () => {
    if (mode === 'node') {
      if (!selectedNode) return;
      // Auto-bind out-ports.
      const bindings: Record<string, { kind: 'var'; key: string }> = {};
      for (const [portName, def] of Object.entries(selectedNode.ports)) {
        if (def.kind === 'out') {
          bindings[portName] = { kind: 'var', key: `scenario.${portName}` };
        }
      }
      onAdd({
        id: uid('s'),
        type: 'action',
        label: customLabel || selectedNode.label,
        order: nextOrder,
        nodeId: selectedNode.id,
        bindings,
        ...(parentStepId ? { parentStepId } : {}),
      });
    } else if (mode === 'control') {
      const meta = STEP_META[controlType];
      const params = defaultParams(controlType);
      onAdd({
        id: uid('s'),
        type: controlType,
        label: customLabel || meta.label,
        order: nextOrder,
        ...(params ? { params } : {}),
        ...(parentStepId ? { parentStepId } : {}),
      });
    } else if (mode === 'subroutine') {
      if (!subroutineId) return;
      const sub = subroutines.find((s) => s.id === subroutineId);
      onAdd({
        id: uid('s'),
        type: 'subroutine',
        label: customLabel || sub?.name || 'サブルーチン',
        order: nextOrder,
        subroutineId,
        ...(parentStepId ? { parentStepId } : {}),
      });
    }
    // Reset and close.
    setSearch('');
    setSelectedNodeId(null);
    setCustomLabel('');
    setSubroutineId('');
    onOpenChange(false);
  };

  const canAdd =
    (mode === 'node' && !!selectedNodeId) ||
    (mode === 'control') ||
    (mode === 'subroutine' && !!subroutineId);

  const modeBtn = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className="flex-1 rounded-lg border-[1.5px] py-1.5 font-mono text-[10px] font-bold transition-colors"
      style={{
        borderColor: mode === m ? '#3b82f6' : 'var(--fl-border-strong)',
        background: mode === m ? '#3b82f620' : 'transparent',
        color: mode === m ? '#3b82f6' : 'var(--fl-text-faint)',
      }}
    >
      {label}
    </button>
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[210] flex max-h-[80vh] w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-fl-border-strong bg-fl-modal p-6 shadow-2xl">
          <Dialog.Title className="mb-1 font-mono text-[13px] font-bold text-fl-text">
            ステップを追加
          </Dialog.Title>
          <Dialog.Description className="mb-4 font-mono text-[10px] text-fl-text-faint">
            タスク: <span className="text-fl-text-muted">{blockLabel}</span>
          </Dialog.Description>

          {/* Mode tabs */}
          <div className="mb-4 flex gap-1.5">
            {modeBtn('node', '▶ ノード')}
            {modeBtn('control', '↻ 制御フロー')}
            {modeBtn('subroutine', '⎔ サブルーチン')}
          </div>

          {/* ── Node mode ── */}
          {mode === 'node' && (
            <>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ノードを検索 (名前 / カテゴリ / ID)"
                className="mb-3 w-full rounded-lg border border-fl-border-strong bg-fl-panel-2 px-3 py-2 font-mono text-[11px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-[#3b82f6]"
              />
              <div className="fl-scroll mb-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-fl-border bg-fl-panel-2">
                {filteredGroups.length === 0 ? (
                  <div className="py-6 text-center font-mono text-[10px] text-fl-text-ghost">
                    {nodeManifest.length === 0
                      ? 'ノードがありません (Pythonランタイムを確認)'
                      : '見つかりません'}
                  </div>
                ) : (
                  filteredGroups.map(([cat, nodes]) => (
                    <div key={cat}>
                      <div className="sticky top-0 bg-fl-panel-2 px-3 py-1 font-mono text-[8px] font-bold uppercase tracking-wider text-fl-text-ghost">
                        {cat}
                      </div>
                      {nodes.map((n) => {
                        const sel = selectedNodeId === n.id;
                        return (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              setSelectedNodeId(n.id);
                              if (!customLabel) setCustomLabel('');
                            }}
                            onDoubleClick={() => {
                              setSelectedNodeId(n.id);
                              handleAdd();
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono transition-colors hover:bg-[#3b82f610]"
                            style={{
                              background: sel ? '#3b82f620' : undefined,
                            }}
                          >
                            <span
                              className="text-[11px]"
                              style={{ color: sel ? '#3b82f6' : 'var(--fl-text-muted)' }}
                            >
                              {n.label}
                            </span>
                            <span className="ml-auto text-[9px] text-fl-text-ghost">
                              {n.id}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
              {selectedNode && (
                <div className="mb-3 rounded-lg border border-[#3b82f644] bg-[#3b82f610] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-[#3b82f6]">
                      {selectedNode.label}
                    </span>
                    <span className="font-mono text-[8px] text-fl-text-ghost">
                      {selectedNode.id} · v{selectedNode.version}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-3 font-mono text-[8px] text-fl-text-faint">
                    {Object.entries(selectedNode.ports).filter(([,d]) => d.kind === 'in').length > 0 && (
                      <span>IN: {Object.entries(selectedNode.ports).filter(([,d]) => d.kind === 'in').map(([n]) => n).join(', ')}</span>
                    )}
                    {Object.entries(selectedNode.ports).filter(([,d]) => d.kind === 'out').length > 0 && (
                      <span>OUT: {Object.entries(selectedNode.ports).filter(([,d]) => d.kind === 'out').map(([n]) => n).join(', ')}</span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Control flow mode ── */}
          {mode === 'control' && (
            <div className="mb-4 flex flex-col gap-1.5">
              {CONTROL_TYPES.map((c) => {
                const sel = controlType === c.type;
                return (
                  <button
                    key={c.type}
                    type="button"
                    onClick={() => setControlType(c.type)}
                    className="flex items-center gap-2 rounded-lg border-[1.5px] px-3 py-2 text-left font-mono transition-colors"
                    style={{
                      borderColor: sel ? c.color : 'var(--fl-border-strong)',
                      background: sel ? `${c.color}18` : 'transparent',
                      color: sel ? c.color : 'var(--fl-text-faint)',
                    }}
                  >
                    <span className="text-[12px]">{c.icon}</span>
                    <span className="text-[11px] font-bold">{c.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Subroutine mode ── */}
          {mode === 'subroutine' && (
            <div className="mb-4">
              {subroutines.length > 0 ? (
                <Select<string>
                  value={subroutineId}
                  onValueChange={setSubroutineId}
                  placeholder="(選択してください)"
                  options={subroutines.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.blocks.length} blocks)`,
                  })) as SelectOption<string>[]}
                  triggerClassName="flex w-full items-center justify-between rounded-lg border border-fl-border-strong bg-fl-panel-2 px-2.5 py-1.5 font-mono text-[11px] text-fl-text outline-none transition-colors hover:border-fl-text-dim data-[popup-open]:border-[#3b82f6]"
                />
              ) : (
                <div className="rounded-lg border border-dashed border-fl-border-strong bg-fl-panel-2 p-4 text-center font-mono text-[10px] text-fl-text-faint">
                  先にサブルーチンを定義してください
                </div>
              )}
            </div>
          )}

          {/* Custom label override */}
          <div className="mb-1">
            <input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder={
                mode === 'node' && selectedNode
                  ? selectedNode.label
                  : mode === 'control'
                    ? STEP_META[controlType].label
                    : 'ラベル (空欄でデフォルト)'
              }
              className="w-full rounded-lg border border-fl-border-strong bg-fl-panel-2 px-2.5 py-1.5 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost"
            />
            <div className="mt-1 font-mono text-[8px] text-fl-text-ghost">
              空欄ならノード名 / 制御タイプ名がラベルになります
            </div>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg border border-fl-border-strong bg-transparent px-4 py-1.5 text-[11px] text-fl-text-faint">
              キャンセル
            </Dialog.Close>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canAdd}
              className="rounded-lg border-none bg-[#3b82f6] px-4 py-1.5 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              追加
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
