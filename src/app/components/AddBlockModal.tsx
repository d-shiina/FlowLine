import { useState } from 'react';
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

const PRESET_LABELS = [
  'クリック',
  'テキスト入力',
  'ファイル読込',
  'メール送信',
  'スクリーンショット',
  'アプリ起動',
  'ウィンドウ切替',
  'キー送信',
];

export function AddBlockModal({
  open,
  onOpenChange,
  trackName,
  trackColor,
  slot,
  onAdd,
}: Props) {
  const [label, setLabel] = useState('クリック');
  const [custom, setCustom] = useState('');

  const handleAdd = () => {
    const finalLabel = custom.trim() || label;
    onAdd({
      id: uid('b'),
      label: finalLabel,
      slot,
      steps: [],
    });
    setCustom('');
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[210] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-fl-border-strong bg-fl-modal p-7 shadow-2xl">
          <Dialog.Title className="mb-1 font-mono text-[13px] font-bold text-fl-text">
            ブロックを追加
          </Dialog.Title>
          <Dialog.Description className="mb-5 font-mono text-[10px] text-fl-text-faint">
            トラック: <span style={{ color: trackColor }}>{trackName}</span> / 位置:{' '}
            <span className="text-fl-text-muted">#{slot}</span>
          </Dialog.Description>

          <div className="mb-5">
            <div className="mb-1.5 font-mono text-[10px] text-fl-text-faint">ラベル</div>
            <div className="mb-2 flex flex-wrap gap-1">
              {PRESET_LABELS.map((l) => {
                const sel = label === l && !custom;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => { setLabel(l); setCustom(''); }}
                    className="rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors"
                    style={{
                      borderColor: sel ? trackColor : 'var(--fl-border-strong)',
                      background: sel ? `${trackColor}20` : 'transparent',
                      color: sel ? trackColor : 'var(--fl-text-faint)',
                    }}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            <input
              placeholder="カスタムラベル"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              className="w-full rounded-lg border border-fl-border-strong bg-fl-panel-2 px-2.5 py-1.5 font-mono text-[11px] text-fl-text outline-none"
            />
          </div>

          <div className="mb-1 font-mono text-[9px] text-fl-text-ghost">
            ステップ（内部ロジック）はブロックをダブルクリックして編集できます
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg border border-fl-border-strong bg-transparent px-4 py-1.5 text-[12px] text-fl-text-faint">
              キャンセル
            </Dialog.Close>
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-lg border-none bg-[#3b82f6] px-4 py-1.5 text-[12px] font-bold text-white"
            >
              追加
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
