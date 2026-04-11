import type { Block } from '../types';
import { BLOCK_META } from '../types';

interface Props {
  block: Block | null;
  trackId: string | null;
  onChange: (trackId: string, blockId: string, patch: Partial<Block>) => void;
  onClose: () => void;
}

/**
 * Right-side properties inspector for the selected block.
 * Minimal editable fields: label, span, onError. Deps are shown read-only.
 */
export function Inspector({ block, trackId, onChange, onClose }: Props) {
  if (!block || !trackId) {
    return (
      <aside className="flex h-full w-72 flex-shrink-0 flex-col border-l border-[#0f172a] bg-[#0a1020] p-4">
        <div className="font-mono text-[10px] text-slate-600">
          ブロックを選択してプロパティを編集
        </div>
      </aside>
    );
  }
  const meta = BLOCK_META[block.type];
  return (
    <aside className="flex h-full w-72 flex-shrink-0 flex-col gap-3 border-l border-[#0f172a] bg-[#0a1020] p-4">
      <div className="flex items-center justify-between">
        <div
          className="font-mono text-[10px] font-bold tracking-wider"
          style={{ color: meta.color }}
        >
          {meta.icon} {meta.label.toUpperCase()}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] text-slate-600 hover:text-slate-400"
        >
          ×
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-slate-600">LABEL</span>
        <input
          value={block.label}
          onChange={(e) =>
            onChange(trackId, block.id, { label: e.target.value })
          }
          className="rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1 font-mono text-[11px] text-slate-200 outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-slate-600">SLOT</span>
        <input
          type="number"
          min={0}
          value={block.slot}
          onChange={(e) =>
            onChange(trackId, block.id, {
              slot: Math.max(0, Number(e.target.value)),
            })
          }
          className="rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1 font-mono text-[11px] text-slate-200 outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-slate-600">SPAN</span>
        <input
          type="number"
          min={1}
          value={block.span}
          onChange={(e) =>
            onChange(trackId, block.id, {
              span: Math.max(1, Number(e.target.value)),
            })
          }
          className="rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1 font-mono text-[11px] text-slate-200 outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-slate-600">ON ERROR</span>
        <select
          value={
            typeof block.onError === 'object'
              ? 'retry'
              : (block.onError ?? 'abort')
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'retry') {
              onChange(trackId, block.id, {
                onError: { retry: 3, then: 'abort' },
              });
            } else {
              onChange(trackId, block.id, { onError: v as 'abort' | 'skip' });
            }
          }}
          className="rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1 font-mono text-[11px] text-slate-200 outline-none"
        >
          <option value="abort">abort</option>
          <option value="skip">skip</option>
          <option value="retry">retry(3)</option>
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-slate-600">DEPS (DAG)</span>
        <div className="rounded-md border border-[#1e293b] bg-[#060c1a] px-2 py-1 font-mono text-[10px] text-slate-500">
          {block.deps.length === 0 ? '(none)' : block.deps.join(', ')}
        </div>
      </div>

      <div className="mt-auto font-mono text-[9px] text-slate-700">
        id: {block.id}
      </div>
    </aside>
  );
}
