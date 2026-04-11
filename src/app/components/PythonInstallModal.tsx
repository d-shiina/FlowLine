import { Dialog } from '@base-ui/react/dialog';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, RefreshCw, XCircle } from 'lucide-react';
import type {
  InstallPhase,
  InstallProgressEvent,
  PythonStatus,
} from '../../globals';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Latest status snapshot — kept in App so the Toolbar chip can reuse it. */
  status: PythonStatus | null;
  /** Called after a successful install so the caller can refresh its status. */
  onInstalled: () => void;
}

/**
 * First-run / on-demand dialog for installing FLOWLINE's isolated
 * Python runtime. Mirrors the main-process ``runtime:install`` flow:
 * the user hits "インストール", the main process downloads a pinned
 * python-build-standalone bundle, and progress events stream back via
 * ``flowlineRuntime.onInstallProgress`` to drive the progress bar.
 *
 * The runtime lives under ``_runtime/python/`` in dev (gitignored) and
 * under ``userData/runtime/python/`` in packaged builds — either way
 * it's completely isolated from the user's system Python so FLOWLINE
 * nodes can't leak into or out of the host environment.
 */
export function PythonInstallModal({
  open,
  onOpenChange,
  status,
  onInstalled,
}: Props) {
  const [phase, setPhase] = useState<InstallPhase | 'idle'>('idle');
  const [progress, setProgress] = useState<number>(Number.NaN);
  const [message, setMessage] = useState<string>('');

  // Subscribe to progress events whenever the dialog is open. The
  // preload-exposed subscribe fn returns an unsubscribe — call it on
  // cleanup so stale listeners don't leak between opens.
  useEffect(() => {
    if (!open) return;
    const api = window.flowlineRuntime;
    if (!api) return;
    const unsubscribe = api.onInstallProgress((p: InstallProgressEvent) => {
      setPhase(p.phase);
      setProgress(p.progress);
      setMessage(p.message);
      if (p.phase === 'done') {
        // Refresh the parent's status snapshot so the chip flips to
        // "installed" immediately, then auto-close after a short beat
        // so the user registers the success state.
        onInstalled();
        window.setTimeout(() => onOpenChange(false), 800);
      }
    });
    return unsubscribe;
  }, [open, onInstalled, onOpenChange]);

  // Reset transient state each time the modal opens so a previous
  // error / done state doesn't leak into the next session.
  useEffect(() => {
    if (open) {
      setPhase('idle');
      setProgress(Number.NaN);
      setMessage('');
    }
  }, [open]);

  const startInstall = useCallback(async () => {
    const api = window.flowlineRuntime;
    if (!api) return;
    setPhase('starting');
    setProgress(Number.NaN);
    setMessage('インストールを開始しています…');
    const res = await api.install();
    if (!res.ok) {
      setPhase('error');
      setMessage(res.error ?? 'インストールに失敗しました');
    }
  }, []);

  const installing =
    phase === 'starting' || phase === 'downloading' || phase === 'extracting';
  const alreadyInstalled = !!status?.pythonPath;
  const pct = Number.isFinite(progress) ? Math.round(progress * 100) : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[210] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-fl-border-strong bg-fl-modal p-7 shadow-2xl">
          <Dialog.Title className="mb-1 font-mono text-[13px] font-bold text-fl-text">
            Python ランタイムのセットアップ
          </Dialog.Title>
          <Dialog.Description className="mb-4 font-mono text-[10px] text-fl-text-faint">
            FLOWLINE はノード実行用に独立した Python ランタイムを使用します。
            システムの Python には一切干渉しません。
          </Dialog.Description>

          {/* Runtime metadata */}
          <div className="mb-4 rounded-lg border border-fl-border bg-fl-panel-2 p-3">
            <div className="flex items-baseline justify-between font-mono text-[10px]">
              <span className="text-fl-text-dim">バージョン</span>
              <span className="text-fl-text">
                Python {status?.version ?? '3.x'}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2 font-mono text-[10px]">
              <span className="flex-shrink-0 text-fl-text-dim">
                インストール先
              </span>
              <span
                className="truncate text-right text-fl-text-faint"
                title={status?.runtimeDir ?? ''}
              >
                {status?.runtimeDir ?? '—'}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono text-[10px]">
              <span className="text-fl-text-dim">状態</span>
              {alreadyInstalled ? (
                <span className="flex items-center gap-1 text-[#22c55e]">
                  <CheckCircle2 className="h-3 w-3" /> インストール済み
                </span>
              ) : (
                <span className="text-[#f59e0b]">未インストール</span>
              )}
            </div>
          </div>

          {/* Progress / status area */}
          {(installing || phase === 'done' || phase === 'error') && (
            <div className="mb-4 rounded-lg border border-fl-border bg-fl-panel-2 p-3">
              {/* Progress bar */}
              {installing && (
                <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-fl-border">
                  <div
                    className="h-full rounded-full bg-[#3b82f6] transition-all duration-200"
                    style={{
                      width: pct !== null ? `${pct}%` : '100%',
                      opacity: pct !== null ? 1 : 0.5,
                      // Indeterminate visual for extracting / starting phases
                      // (pct === null) by riding at full width with lower alpha.
                    }}
                  />
                </div>
              )}
              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                {phase === 'done' && (
                  <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-[#22c55e]" />
                )}
                {phase === 'error' && (
                  <XCircle className="h-3 w-3 flex-shrink-0 text-[#ef4444]" />
                )}
                <span
                  className={
                    phase === 'error'
                      ? 'text-[#ef4444]'
                      : phase === 'done'
                        ? 'text-[#22c55e]'
                        : 'text-fl-text-dim'
                  }
                >
                  {message || '…'}
                </span>
                {pct !== null && installing && (
                  <span className="ml-auto text-fl-text-faint">{pct}%</span>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Dialog.Close
              className="rounded-lg border border-fl-border-strong bg-transparent px-4 py-1.5 font-mono text-[10px] text-fl-text-faint transition-colors hover:text-fl-text disabled:cursor-not-allowed disabled:opacity-40"
              disabled={installing}
            >
              {alreadyInstalled ? '閉じる' : 'あとで'}
            </Dialog.Close>
            {!alreadyInstalled && (
              <button
                type="button"
                onClick={startInstall}
                disabled={installing}
                className="flex items-center gap-1 rounded-lg border border-[#3b82f6] bg-[#3b82f622] px-4 py-1.5 font-mono text-[10px] font-bold text-[#3b82f6] transition-colors hover:bg-[#3b82f633] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {phase === 'error' ? (
                  <>
                    <RefreshCw className="h-3 w-3" /> 再試行
                  </>
                ) : (
                  <>
                    <Download className="h-3 w-3" />{' '}
                    {installing ? 'インストール中…' : 'インストール'}
                  </>
                )}
              </button>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
