import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import {
  STEP_META,
  type Step,
  type StepType,
  type Subroutine,
} from '../types';
import { uid } from '../useScenario';
import { Select, type SelectOption } from './ui/Select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockLabel: string;
  nextOrder: number;
  /** When adding inside a group, the parent step id. */
  parentStepId?: string;
  subroutines: Subroutine[];
  onAdd: (step: Step) => void;
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

function defaultLabel(type: StepType): string {
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
    case 'group':
      return 'グループ';
    case 'action':
    default:
      return 'アクション';
  }
}

function defaultParams(type: StepType): Record<string, unknown> | undefined {
  if (type === 'switch') {
    return { cases: ['case_0', 'case_1', 'default'] };
  }
  return undefined;
}

export function AddStepModal({
  open,
  onOpenChange,
  blockLabel,
  nextOrder,
  parentStepId,
  subroutines,
  onAdd,
}: Props) {
  const [type, setType] = useState<StepType>('action');
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
      id: uid('s'),
      type,
      label: finalLabel,
      order: nextOrder,
      ...(params !== undefined ? { params } : {}),
      ...(type === 'subroutine' ? { subroutineId } : {}),
      ...(parentStepId ? { parentStepId } : {}),
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
            ステップを追加
          </Dialog.Title>
          <Dialog.Description className="mb-5 font-mono text-[10px] text-fl-text-faint">
            タスク: <span className="text-fl-text-muted">{blockLabel}</span>
          </Dialog.Description>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {(
              Object.entries(STEP_META) as Array<
                [StepType, (typeof STEP_META)[StepType]]
              >
            ).map(([key, m]) => {
              const selected = type === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key as StepType)}
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
              <div className="mb-1.5 font-mono text-[10px] text-fl-text-faint">
                ラベル
              </div>
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
                        borderColor: sel
                          ? '#3b82f6'
                          : 'var(--fl-border-strong)',
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

          {(type === 'loop' ||
            type === 'branch' ||
            type === 'switch' ||
            type === 'group') && (
            <div className="mb-5">
              <div className="mb-1.5 font-mono text-[10px] text-fl-text-faint">
                ラベル
              </div>
              <input
                placeholder={defaultLabel(type)}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="w-full rounded-lg border border-fl-border-strong bg-fl-panel-2 px-2.5 py-1.5 font-mono text-[11px] text-fl-text outline-none"
              />
            </div>
          )}

          <div className="mb-1 font-mono text-[9px] text-fl-text-ghost">
            パラメータやエラー処理はステップ選択後に Inspector で調整できます
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
