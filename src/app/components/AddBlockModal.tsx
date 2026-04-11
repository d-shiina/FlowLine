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
  const [span, setSpan] = useState(1);

  const handleAdd = () => {
    const finalLabel =
      custom ||
      label ||
      (type === 'loop'
        ? 'ループ'
        : type === 'branch'
          ? '分岐'
          : type === 'wait'
            ? '待機'
            : type === 'sync'
              ? '同期'
              : type === 'subroutine'
                ? 'サブルーチン'
                : 'アクション');
    onAdd({
      id: uid('b'),
      type,
      label: finalLabel,
      slot,
      span,
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
            {(Object.entries(BLOCK_META) as Array<[BlockType, typeof BLOCK_META[BlockType]]>).map(
              ([key, m]) => {
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
              },
            )}
          </div>

          {(type === 'action' || type === 'wait') && (
            <div className="mb-3">
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

          {type !== 'sync' && (
            <div className="mb-5">
              <div className="mb-1.5 font-mono text-[10px] text-slate-600">
                スパン: <span className="text-slate-400">{span} slot</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={span}
                  onChange={(e) => setSpan(Number(e.target.value))}
                  className="flex-1 accent-[#3B82F6]"
                />
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={span}
                  onChange={(e) => setSpan(Math.max(1, Number(e.target.value)))}
                  className="w-14 rounded-md border border-[#334155] bg-[#0f172a] px-1.5 py-1 text-center font-mono text-[11px] text-slate-200 outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
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
