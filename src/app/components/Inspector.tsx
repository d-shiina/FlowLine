import type { Block, OnError } from '../types';
import { BLOCK_META } from '../types';

interface Props {
  block: Block | null;
  trackId: string | null;
  isErrorHandler: boolean;
  onChange: (trackId: string, blockId: string, patch: Partial<Block>) => void;
  onClose: () => void;
}

type OnErrorKey = 'abort' | 'skip' | 'ignore' | 'retry';

function toKey(v: OnError | undefined): OnErrorKey {
  if (v === undefined) return 'abort';
  if (typeof v === 'object') return 'retry';
  return v;
}

function fromKey(k: OnErrorKey, current: OnError | undefined): OnError {
  if (k === 'retry') {
    // Preserve existing retry count if already retry, else default to 3.
    const n =
      typeof current === 'object' && 'retry' in current ? current.retry : 3;
    return { retry: n, then: 'skip' };
  }
  return k;
}

/**
 * Right-side properties inspector for the selected block.
 *
 * For blocks inside the error handler track, `abort` is hidden from the
 * onError options (see docs/02-error-handling.md).
 */
export function Inspector({
  block,
  trackId,
  isErrorHandler,
  onChange,
  onClose,
}: Props) {
  if (!block || !trackId) {
    return (
      <aside className="flex h-full w-72 flex-shrink-0 flex-col border-l border-[#0f172a] bg-[#0a1020] p-4">
        <div className="font-mono text-[10px] text-slate-600">
          ブロックを選択してプロパティを編集
        </div>
      </aside>
    );
  }
  const meta = BLOCK_META[block.type];
  const onErrorKey = toKey(block.onError);
  const hasTimeout = block.timeout !== undefined;

  return (
    <aside className="flex h-full w-72 flex-shrink-0 flex-col gap-3 overflow-y-auto border-l border-[#0f172a] bg-[#0a1020] p-4">
      <div className="flex items-center justify-between">
        <div
          className="font-mono text-[10px] font-bold tracking-wider"
          style={{ color: meta.color }}
        >
          {meta.icon} {meta.label.toUpperCase()}
          {isErrorHandler && (
            <span className="ml-1 text-[#f43f5e]">/ エラー処理</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] text-slate-600 hover:text-slate-400"
        >
          ×
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-slate-600">LABEL</span>
        <input
          value={block.label}
          onChange={(e) =>
            onChange(trackId, block.id, { label: e.target.value })
          }
          className="rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1 font-mono text-[11px] text-slate-200 outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-slate-600">SLOT</span>
        <input
          type="number"
          min={0}
          value={block.slot}
          onChange={(e) =>
            onChange(trackId, block.id, {
              slot: Math.max(0, Number(e.target.value)),
            })
          }
          className="rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1 font-mono text-[11px] text-slate-200 outline-none"
        />
      </label>

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
          <input
            type="checkbox"
            checked={!!block.skipIfMissing}
            onChange={(e) =>
              onChange(trackId, block.id, {
                skipIfMissing: e.target.checked || undefined,
              })
            }
            className="accent-[#eab308]"
          />
          ターゲットが見つからなくてもOK
        </label>
        <span className="pl-5 font-mono text-[9px] text-slate-700">
          （想定内の不在は静かにスキップ）
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between font-mono text-[9px] text-slate-600">
          <span>TIMEOUT (秒)</span>
          <label className="flex items-center gap-1 text-[9px] text-slate-500">
            <input
              type="checkbox"
              checked={hasTimeout}
              onChange={(e) =>
                onChange(trackId, block.id, {
                  timeout: e.target.checked ? 30 : undefined,
                })
              }
              className="accent-[#06b6d4]"
            />
            個別設定
          </label>
        </div>
        <input
          type="number"
          min={1}
          disabled={!hasTimeout}
          value={block.timeout ?? ''}
          placeholder="engine default"
          onChange={(e) =>
            onChange(trackId, block.id, {
              timeout: e.target.value ? Math.max(1, Number(e.target.value)) : undefined,
            })
          }
          className="rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1 font-mono text-[11px] text-slate-200 outline-none disabled:opacity-40"
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-slate-600">ON ERROR</span>
        <select
          value={onErrorKey}
          onChange={(e) => {
            const k = e.target.value as OnErrorKey;
            onChange(trackId, block.id, {
              onError: fromKey(k, block.onError),
            });
          }}
          className="rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1 font-mono text-[11px] text-slate-200 outline-none"
        >
          {!isErrorHandler && <option value="abort">中断 (abort)</option>}
          <option value="skip">次へ (skip)</option>
          <option value="ignore">無視 (ignore)</option>
          {!isErrorHandler && <option value="retry">リトライ (retry)</option>}
        </select>
        {isErrorHandler && (
          <span className="font-mono text-[9px] text-[#f43f5e88]">
            エラー処理内では abort / retry は無効
          </span>
        )}
        {onErrorKey === 'retry' && typeof block.onError === 'object' && (
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-slate-500">
            <input
              type="number"
              min={1}
              max={20}
              value={block.onError.retry}
              onChange={(e) =>
                onChange(trackId, block.id, {
                  onError: {
                    retry: Math.max(1, Number(e.target.value)),
                    then: (block.onError as { then: 'abort' | 'skip' }).then,
                  },
                })
              }
              className="w-12 rounded border border-[#334155] bg-[#0f172a] px-1 py-0.5 text-center font-mono text-[10px] text-slate-200 outline-none"
            />
            回 →
            <select
              value={block.onError.then}
              onChange={(e) =>
                onChange(trackId, block.id, {
                  onError: {
                    retry: (block.onError as { retry: number }).retry,
                    then: e.target.value as 'abort' | 'skip',
                  },
                })
              }
              className="rounded border border-[#334155] bg-[#0f172a] px-1 py-0.5 font-mono text-[10px] text-slate-200 outline-none"
            >
              {!isErrorHandler && <option value="abort">abort</option>}
              <option value="skip">skip</option>
            </select>
          </div>
        )}
      </label>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-slate-600">DEPS (DAG)</span>
        <div className="rounded-md border border-[#1e293b] bg-[#060c1a] px-2 py-1 font-mono text-[10px] text-slate-500">
          {block.deps.length === 0 ? '(none)' : block.deps.join(', ')}
        </div>
      </div>

      <div className="mt-auto font-mono text-[9px] text-slate-700">
        id: {block.id}
      </div>
    </aside>
  );
}
