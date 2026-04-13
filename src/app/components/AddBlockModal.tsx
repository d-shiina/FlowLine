import { useEffect, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import type { Block } from '../types';
import { uid } from '../useScenario';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackName: string;
  trackColor: string;
  slot: number;
  onAdd: (block: Block) => void;
}

/**
 * Modal for adding a new task block to a timeline track.
 *
 * A block is just a named task container — its internal logic (nodes,
 * params, etc.) is configured later in the flowchart editor by
 * double-clicking the block. This modal only asks for a label.
 */
export function AddBlockModal({
  open,
  onOpenChange,
  trackName,
  trackColor,
  slot,
  onAdd,
}: Props) {
  const [label, setLabel] = useState('');

  // Reset label whenever the modal opens.
  useEffect(() => {
    if (open) setLabel('');
  }, [open]);

  const handleAdd = () => {
    const finalLabel = label.trim() || `タスク #${slot}`;
    onAdd({
      id: uid('b'),
      label: finalLabel,
      slot,
      steps: [],
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[210] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-fl-border-strong bg-fl-modal p-6 shadow-2xl">
          <Dialog.Title className="mb-1 font-mono text-[13px] font-bold text-fl-text">
            タスクを追加
          </Dialog.Title>
          <Dialog.Description className="mb-5 font-mono text-[10px] text-fl-text-faint">
            トラック:{' '}
            <span style={{ color: trackColor }}>{trackName}</span> / slot:{' '}
            <span className="text-fl-text-muted">#{slot}</span>
          </Dialog.Description>

          <div className="mb-2 font-mono text-[10px] text-fl-text-faint">
            タスク名
          </div>
          <input
            autoFocus
            placeholder={`例: データ取得 / ログイン / 保存`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            className="mb-4 w-full rounded-lg border border-fl-border-strong bg-fl-panel-2 px-3 py-2 font-mono text-[11px] text-fl-text outline-none focus:border-[#3b82f6]"
          />

          <div className="font-mono text-[9px] text-fl-text-ghost">
            作成後、ブロックをダブルクリックして中身のフローを組み立てます
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg border border-fl-border-strong bg-transparent px-4 py-1.5 font-mono text-[11px] text-fl-text-faint transition-colors hover:text-fl-text">
              キャンセル
            </Dialog.Close>
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-lg border-none bg-[#3b82f6] px-4 py-1.5 font-mono text-[11px] font-bold text-white hover:bg-[#2563eb]"
            >
              追加
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
