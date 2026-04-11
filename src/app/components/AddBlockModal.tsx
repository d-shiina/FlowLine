import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import {
  BLOCK_META,
  type Block,
  type BlockType,
  type Subroutine,
} from '../types';
import { uid } from '../useScenario';
import { Select, type SelectOption } from './ui/Select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackName: string;
  trackColor: string;
  slot: number;
  subroutines: Subroutine[];
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
    case 'switch':
      return 'スイッチ';
    case 'wait':
      return '待機';
    case 'subroutine':
      return 'サブルーチン';
    case 'action':
    default:
      return 'アクション';
  }
}

/** Initial params scaffolding for types that need a default shape. */
function defaultParams(type: BlockType): Record<string, unknown> | undefined {
  if (type === 'switch') {
    // Two cases + a default is the most common starting shape and
    // populates the visual lanes immediately so the user sees the
    // fork. Expression is left blank — the user configures it in
    // the Inspector's evaluation field.
    return { cases: ['case_0', 'case_1', 'default'] };
  }
  return undefined;
}

export function AddBlockModal({
  open,
  onOpenChange,
  trackName,
  trackColor,
  slot,
  subroutines,
  onAdd,
}: Props) {
  const [type, setType] = useState<BlockType>('action');
  const [label, setLabel] = useState('クリック');
  const [custom, setCustom] = useState('');
  const [subroutineId, setSubroutineId] = useState<string>('');

  const canAddSubroutineCall = subroutines.length > 0;

  const handleAdd = () => {
    if (type === 'subroutine' && !subroutineId) return;
    const sub =
      type === 'subroutine'
        ? subroutines.find((s) => s.id === subroutineId)
        : undefined;
    const finalLabel =
      type === 'subroutine'
        ? (sub?.name ?? defaultLabel(type))
        : custom || label || defaultLabel(type);
    const params = defaultParams(type);
    onAdd({
      id: uid('b'),
      type,
      label: finalLabel,
      slot,
      deps: [],
      ...(params !== undefined ? { params } : {}),
      ...(type === 'subroutine' ? { subroutineId } : {}),
    });
    setCustom('');
    setSubroutineId('');
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
                    borderColor: selected ? m.color : 'var(--fl-border-strong)',
                    background: selected ? `${m.color}20` : 'transparent',
                    color: selected ? m.color : 'var(--fl-text-faint)',
                  }}
                >
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>

          {type === 'subroutine' && (
            <div className="mb-5">
              <div className="mb-1.5 font-mono text-[10px] text-fl-text-faint">
                呼び出すサブルーチン
              </div>
              {canAddSubroutineCall ? (
                <Select<string>
                  value={subroutineId}
                  onValueChange={setSubroutineId}
                  placeholder="(選択してください)"
                  options={
                    subroutines.map((s) => ({
                      value: s.id,
                      label: `${s.name} (${s.blocks.length} blocks)`,
                    })) as SelectOption<string>[]
                  }
                  triggerClassName="flex w-full items-center justify-between rounded-lg border border-fl-border-strong bg-fl-panel-2 px-2.5 py-1.5 font-mono text-[11px] text-fl-text outline-none transition-colors hover:border-fl-text-dim data-[popup-open]:border-[#3b82f6]"
                />
              ) : (
                <div className="rounded-lg border border-dashed border-fl-border-strong bg-fl-panel-2 p-3 text-center font-mono text-[10px] text-fl-text-faint">
                  左サイドバーから先にサブルーチンを定義してください
                </div>
              )}
            </div>
          )}

          {(type === 'action' || type === 'wait') && (
            <div className="mb-5">
              <div className="mb-1.5 font-mono text-[10px] text-fl-text-faint">ラベル</div>
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
                        borderColor: sel ? '#3b82f6' : 'var(--fl-border-strong)',
                        background: sel ? '#3b82f620' : 'transparent',
                        color: sel ? '#3b82f6' : 'var(--fl-text-faint)',
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
                className="w-full rounded-lg border border-fl-border-strong bg-fl-panel-2 px-2.5 py-1.5 font-mono text-[11px] text-fl-text outline-none"
              />
            </div>
          )}

          <div className="mb-1 font-mono text-[9px] text-fl-text-ghost">
            タイムアウトやエラー処理は、追加後に右サイドの Inspector で調整できます
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg border border-fl-border-strong bg-transparent px-4 py-1.5 text-[12px] text-fl-text-faint">
              キャンセル
            </Dialog.Close>
            <button
              type="button"
              onClick={handleAdd}
              disabled={type === 'subroutine' && !subroutineId}
              className="rounded-lg border-none bg-[#3b82f6] px-4 py-1.5 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              追加
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
