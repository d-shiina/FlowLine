import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { BLOCK_META, type Block, type BlockType } from '../types';
import { uid } from '../useScenario';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackName: string;
  trackColor: string;
  slot: number;
  onAdd: (block: Block) => void;
}

const ACTION_LABELS = [
  'クリック',
  'テキスト入力',
  'ファイル読込',
  'メール送信',
  'スクリーンショット',
  'アプリ起動',
  'ウィンドウ切替',
  'キー送信',
];

function defaultLabel(type: BlockType): string {
  switch (type) {
    case 'loop':
      return 'ループ';
    case 'branch':
      return '分岐';
    case 'wait':
      return '待機';
    case 'subroutine':
      return 'サブルーチン';
    case 'action':
    default:
      return 'アクション';
  }
}

export function AddBlockModal({
  open,
  onOpenChange,
  trackName,
  trackColor,
  slot,
  onAdd,
}: Props) {
  const [type, setType] = useState<BlockType>('action');
  const [label, setLabel] = useState('クリック');
  const [custom, setCustom] = useState('');

  const handleAdd = () => {
    const finalLabel = custom || label || defaultLabel(type);
    onAdd({
      id: uid('b'),
      type,
      label: finalLabel,
      slot,
      deps: [],
    });
    setCustom('');
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[210] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#334155] bg-[#1a2235] p-7 shadow-2xl">
          <Dialog.Title className="mb-1 font-mono text-[13px] font-bold text-slate-200">
            ブロックを追加
          </Dialog.Title>
          <Dialog.Description className="mb-5 font-mono text-[10px] text-slate-600">
            トラック: <span style={{ color: trackColor }}>{trackName}</span> / 位置:{' '}
            <span className="text-slate-400">#{slot}</span>
          </Dialog.Description>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {(
              Object.entries(BLOCK_META) as Array<
                [BlockType, (typeof BLOCK_META)[BlockType]]
              >
            ).map(([key, m]) => {
              const selected = type === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key)}
                  className="flex-auto rounded-lg border-[1.5px] px-1 py-1 font-mono text-[10px] font-bold transition-colors"
                  style={{
                    borderColor: selected ? m.color : '#334155',
                    background: selected ? `${m.color}20` : 'transparent',
                    color: selected ? m.color : '#475569',
                  }}
                >
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>

          {(type === 'action' || type === 'wait') && (
            <div className="mb-5">
              <div className="mb-1.5 font-mono text-[10px] text-slate-600">ラベル</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {ACTION_LABELS.map((l) => {
                  const sel = label === l;
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLabel(l)}
                      className="rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors"
                      style={{
                        borderColor: sel ? '#3B82F6' : '#334155',
                        background: sel ? '#3B82F620' : 'transparent',
                        color: sel ? '#3B82F6' : '#64748b',
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
                className="w-full rounded-lg border border-[#334155] bg-[#0f172a] px-2.5 py-1.5 font-mono text-[11px] text-slate-200 outline-none"
              />
            </div>
          )}

          <div className="mb-1 font-mono text-[9px] text-slate-700">
            タイムアウトやエラー処理は、追加後に右サイドの Inspector で調整できます
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg border border-[#334155] bg-transparent px-4 py-1.5 text-[12px] text-slate-600">
              キャンセル
            </Dialog.Close>
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-lg border-none bg-[#3B82F6] px-4 py-1.5 text-[12px] font-bold text-white"
            >
              追加
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
