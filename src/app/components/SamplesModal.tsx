import { Dialog } from '@base-ui/react/dialog';
import { SAMPLES, cloneSample } from '../samples';
import type { Scenario } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (scenario: Scenario) => void;
}

/**
 * Dialog for replacing the current scenario with a bundled sample.
 * Samples are cloned on load so the SAMPLES array stays immutable.
 */
export function SamplesModal({ open, onOpenChange, onLoad }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[210] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#334155] bg-[#1a2235] p-7 shadow-2xl">
          <Dialog.Title className="mb-1 font-mono text-[13px] font-bold text-slate-200">
            サンプルシナリオを読込
          </Dialog.Title>
          <Dialog.Description className="mb-5 font-mono text-[10px] text-slate-600">
            現在のシナリオは上書きされます
          </Dialog.Description>

          <div className="flex flex-col gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onLoad(cloneSample(s.scenario));
                  onOpenChange(false);
                }}
                className="rounded-lg border border-[#334155] bg-[#0f172a] p-3 text-left transition-colors hover:border-[#3B82F6] hover:bg-[#3B82F610]"
              >
                <div className="font-mono text-[11px] font-bold text-slate-200">
                  {s.label}
                </div>
                <div className="mt-0.5 font-mono text-[9px] text-slate-500">
                  {s.description}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 flex justify-end">
            <Dialog.Close className="rounded-lg border border-[#334155] bg-transparent px-4 py-1.5 text-[12px] text-slate-600">
              キャンセル
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
