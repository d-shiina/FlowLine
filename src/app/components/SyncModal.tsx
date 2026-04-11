import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import type { SyncPoint, Track } from '../types';
import { uid } from '../useScenario';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: number;
  tracks: Track[];
  onAdd: (sp: SyncPoint) => void;
}

/**
 * Add a sync point at a given slot. The user picks which tracks it covers;
 * deps are inferred from the latest block on each selected track whose
 * slot+span <= current slot (a simple heuristic; user can refine later).
 */
export function SyncModal({ open, onOpenChange, slot, tracks, onAdd }: Props) {
  const [label, setLabel] = useState('合流');
  const [selected, setSelected] = useState<string[]>(() => tracks.map((t) => t.id));

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const handleAdd = () => {
    // infer deps: for each selected track, find the rightmost block whose
    // slot is strictly before the sync slot.
    const deps: string[] = [];
    for (const tid of selected) {
      const track = tracks.find((t) => t.id === tid);
      if (!track) continue;
      let best: { id: string; slot: number } | null = null;
      for (const b of track.blocks) {
        if (b.slot < slot && (!best || b.slot > best.slot)) {
          best = { id: b.id, slot: b.slot };
        }
      }
      if (best) deps.push(best.id);
    }
    onAdd({
      id: uid('sync'),
      slot,
      label: label || '合流',
      deps,
      trackIds: selected,
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[210] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#f43f5e44] bg-[#1a2235] p-7 shadow-2xl">
          <Dialog.Title className="mb-1 font-mono text-[13px] font-bold text-[#f43f5e]">
            ⬡ 同期ポイント追加
          </Dialog.Title>
          <Dialog.Description className="mb-5 font-mono text-[10px] text-slate-600">
            位置: <span className="text-slate-400">#{slot}</span>
          </Dialog.Description>

          <div className="mb-3">
            <div className="mb-1.5 font-mono text-[10px] text-slate-600">ラベル</div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-[#334155] bg-[#0f172a] px-2.5 py-1.5 font-mono text-[11px] text-slate-200 outline-none"
            />
          </div>

          <div className="mb-5">
            <div className="mb-2 font-mono text-[10px] text-slate-600">対象トラック</div>
            {tracks.map((t) => {
              const on = selected.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="mb-1 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors"
                  style={{
                    background: on ? `${t.color}18` : 'transparent',
                    borderColor: on ? `${t.color}60` : '#1e293b',
                  }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: on ? t.color : '#334155' }}
                  />
                  <span
                    className="font-mono text-[11px]"
                    style={{ color: on ? t.color : '#475569' }}
                  >
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-end gap-2">
            <Dialog.Close className="rounded-lg border border-[#334155] bg-transparent px-4 py-1.5 text-[12px] text-slate-600">
              キャンセル
            </Dialog.Close>
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-lg border-none bg-[#f43f5e] px-4 py-1.5 text-[12px] font-bold text-white"
            >
              追加
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
