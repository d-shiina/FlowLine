import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import type { SyncPoint } from '../types';
import { uid } from '../useScenario';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: number;
  onAdd: (sp: SyncPoint) => void;
}

/**
 * Add a sync point at a given slot. The user sets a label and slot;
 * at runtime the engine waits for all blocks with slot < sp.slot.
 */
export function SyncModal({ open, onOpenChange, slot, onAdd }: Props) {
  const [label, setLabel] = useState('合流');

  const handleAdd = () => {
    onAdd({
      id: uid('sync'),
      slot,
      label: label || '合流',
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[210] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#f43f5e44] bg-fl-modal p-7 shadow-2xl">
          <Dialog.Title className="mb-1 font-mono text-[13px] font-bold text-[#f43f5e]">
            ⬡ 同期ポイント追加
          </Dialog.Title>
          <Dialog.Description className="mb-5 font-mono text-[10px] text-fl-text-faint">
            位置: <span className="text-fl-text-muted">#{slot}</span>
          </Dialog.Description>

          <div className="mb-5">
            <div className="mb-1.5 font-mono text-[10px] text-fl-text-faint">ラベル</div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-fl-border-strong bg-fl-panel-2 px-2.5 py-1.5 font-mono text-[11px] text-fl-text outline-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Dialog.Close className="rounded-lg border border-fl-border-strong bg-transparent px-4 py-1.5 text-[12px] text-fl-text-faint">
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
