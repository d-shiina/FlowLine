import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { describeType, formatLiteral, parseLiteral } from '../valueLiteral';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current scenario-scope variables keyed by flat name (no prefix). */
  variables: Record<string, unknown>;
  /**
   * Live snapshot from the executor. Keys are prefixed
   * (`scenario.x`, `track.<id>.loop_index`, etc.). Empty between
   * runs — when non-empty the modal shows a read-only "実行中" panel
   * alongside the editable definitions so the user can see what
   * each variable currently evaluates to.
   */
  runtimeSnapshot?: Record<string, unknown>;
  onSet: (key: string, value: unknown) => void;
  onRename: (oldKey: string, newKey: string) => void;
  onDelete: (key: string) => void;
}

/**
 * Scenario-level variable store editor.
 *
 * Lists every key in ``scenario.variables.scenario`` and lets the
 * user add, rename, edit or delete entries. The editor is
 * deliberately type-free: the user types the value as-is and the
 * parser figures out whether it's a number / bool / JSON / string.
 * A faint type badge next to the input shows how the value was
 * interpreted so there are no surprises.
 *
 * Values live under the ``scenario.`` prefix at runtime (so a row
 * labelled ``target`` shows up in the Inspector bindings as
 * ``scenario.target``). Edits commit on blur / Enter — consistent
 * with the rest of the app's live-apply feel.
 */
export function VariablesModal({
  open,
  onOpenChange,
  variables,
  runtimeSnapshot,
  onSet,
  onRename,
  onDelete,
}: Props) {
  const entries = useMemo(
    () => Object.entries(variables).sort(([a], [b]) => a.localeCompare(b)),
    [variables],
  );
  // Runtime entries that aren't defined in the editable store are
  // usually track-scope (e.g. ``track.<id>.loop_index``). We show
  // them in a separate read-only panel so the user can debug what
  // the executor sees without accidentally editing them into the
  // persistent scenario.
  const runtimeEntries = useMemo(() => {
    if (!runtimeSnapshot) return [];
    return Object.entries(runtimeSnapshot).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [runtimeSnapshot]);

  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  const handleAdd = () => {
    const key = draftKey.trim();
    if (!key) {
      setDraftError('キー名を入力してください');
      return;
    }
    if (key in variables) {
      setDraftError('同じキーが既に存在します');
      return;
    }
    onSet(key, parseLiteral(draftValue));
    setDraftKey('');
    setDraftValue('');
    setDraftError(null);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[210] w-[560px] max-h-[80vh] -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-2xl border border-fl-border-strong bg-fl-modal p-7 shadow-2xl">
          <Dialog.Title className="mb-1 font-mono text-[13px] font-bold text-fl-text">
            シナリオ変数
          </Dialog.Title>
          <Dialog.Description className="mb-4 font-mono text-[10px] text-fl-text-faint">
            ノードの in / out ポートをバインドする共有ストア。ここで
            設定した値は <span className="text-fl-text-dim">scenario.キー</span>
            &nbsp;でアクセスできます。
          </Dialog.Description>

          {/* Existing rows */}
          <div className="fl-scroll mb-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-lg border border-fl-border bg-fl-panel-2 p-2">
            {entries.length === 0 ? (
              <div className="py-6 text-center font-mono text-[10px] text-fl-text-ghost">
                まだ変数が定義されていません
              </div>
            ) : (
              entries.map(([key, value]) => (
                <VariableRow
                  key={key}
                  name={key}
                  value={value}
                  runtimeValue={runtimeSnapshot?.[`scenario.${key}`]}
                  onRename={(next) => onRename(key, next)}
                  onValueChange={(next) => onSet(key, next)}
                  onDelete={() => onDelete(key)}
                />
              ))
            )}
          </div>

          {runtimeEntries.length > 0 && (
            <div className="mb-4 rounded-lg border border-fl-border bg-fl-panel-2 p-2">
              <div className="mb-1.5 flex items-center gap-1 font-mono text-[9px] tracking-wider text-fl-text-faint">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#22c55e]" />
                実行中スナップショット ({runtimeEntries.length})
              </div>
              <div className="flex max-h-[140px] flex-col gap-0.5 overflow-y-auto">
                {runtimeEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded bg-fl-bg px-1.5 py-0.5"
                  >
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-[9px] text-fl-text-dim"
                      title={key}
                    >
                      {key}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-right font-mono text-[9px] text-fl-text"
                      title={String(value)}
                    >
                      {formatLiteral(value) || '""'}
                    </span>
                    <span className="w-10 text-right font-mono text-[8px] text-fl-text-ghost">
                      {describeType(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New row form */}
          <div className="rounded-lg border border-dashed border-fl-border-strong bg-fl-panel-2 p-3">
            <div className="mb-2 font-mono text-[9px] tracking-wider text-fl-text-faint">
              + 新規変数
            </div>
            <div className="flex items-center gap-1.5">
              <input
                value={draftKey}
                onChange={(e) => {
                  setDraftKey(e.target.value);
                  setDraftError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                }}
                placeholder="キー名 (例: target)"
                className="min-w-0 flex-[1.2] rounded border border-fl-border-2 bg-fl-bg px-2 py-1 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-fl-text-dim"
              />
              <input
                value={draftValue}
                onChange={(e) => {
                  setDraftValue(e.target.value);
                  setDraftError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                }}
                placeholder='値 (例: hello / 42 / true / {"x":1})'
                className="min-w-0 flex-[2] rounded border border-fl-border-2 bg-fl-bg px-2 py-1 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-fl-text-dim"
              />
              <button
                type="button"
                onClick={handleAdd}
                className="flex flex-shrink-0 items-center gap-1 rounded border border-[#3b82f6] bg-[#3b82f622] px-2 py-1 font-mono text-[10px] font-bold text-[#3b82f6] transition-colors hover:bg-[#3b82f633]"
              >
                <Plus className="h-2.5 w-2.5" />
                追加
              </button>
            </div>
            {draftError && (
              <div className="mt-1.5 font-mono text-[9px] text-[#ef4444]">
                {draftError}
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <Dialog.Close className="rounded-lg border border-fl-border-strong bg-transparent px-4 py-1.5 font-mono text-[10px] text-fl-text-faint transition-colors hover:text-fl-text">
              閉じる
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ──────────────────────────────────────────────────────────────────
// Individual row
// ──────────────────────────────────────────────────────────────────

interface RowProps {
  name: string;
  value: unknown;
  /** Optional live value from the executor's snapshot. */
  runtimeValue?: unknown;
  onRename: (next: string) => void;
  onValueChange: (next: unknown) => void;
  onDelete: () => void;
}

function VariableRow({
  name,
  value,
  runtimeValue,
  onRename,
  onValueChange,
  onDelete,
}: RowProps) {
  const [localKey, setLocalKey] = useState(name);
  const [local, setLocal] = useState<string>(() => formatLiteral(value));

  // Resync when the external identity changes (undo/redo, scenario
  // load, rename). We key on a combination of name + stringified
  // value so an external value update also reflows.
  const identityKey = `${name}::${formatLiteral(value)}`;
  useKeyChangeEffect(identityKey, () => {
    setLocalKey(name);
    setLocal(formatLiteral(value));
  });

  const commitKey = () => {
    const trimmed = localKey.trim();
    if (!trimmed || trimmed === name) {
      setLocalKey(name);
      return;
    }
    onRename(trimmed);
  };

  const commitValue = () => {
    onValueChange(parseLiteral(local));
  };

  // Preview the type we'd store if the user committed right now.
  const previewType = describeType(parseLiteral(local));

  return (
    <div className="group flex items-center gap-1.5 rounded border border-fl-border-2 bg-fl-bg px-2 py-1.5">
      <input
        value={localKey}
        onChange={(e) => setLocalKey(e.target.value)}
        onBlur={commitKey}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setLocalKey(name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="min-w-0 flex-[1.2] bg-transparent font-mono text-[10px] text-fl-text outline-none"
      />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commitValue}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="min-w-0 flex-[2] rounded border border-fl-border-2 bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none focus:border-fl-text-dim"
      />
      <span
        className="flex-shrink-0 font-mono text-[8px] text-fl-text-ghost"
        style={{ width: 42, textAlign: 'right' }}
        title={`解釈された型: ${previewType}`}
      >
        {previewType}
      </span>
      {runtimeValue !== undefined &&
        formatLiteral(runtimeValue) !== formatLiteral(value) && (
          <span
            className="flex-shrink-0 truncate rounded bg-[#22c55e18] px-1 py-0.5 font-mono text-[8px] text-[#22c55e]"
            style={{ maxWidth: 80 }}
            title={`実行中の現在値: ${formatLiteral(runtimeValue)}`}
          >
            → {formatLiteral(runtimeValue)}
          </span>
        )}
      <button
        type="button"
        onClick={onDelete}
        className="flex-shrink-0 text-fl-text-faint opacity-0 transition-all group-hover:opacity-100 hover:text-red-500"
        title="削除"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * Re-run `effect` only when `key` changes across renders, used by
 * VariableRow to resync its local editor state on identity changes
 * (undo / redo / external replace) without fighting the user's
 * in-progress typing.
 */
function useKeyChangeEffect(key: string, effect: () => void): void {
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (prev.current !== key) {
      prev.current = key;
      effect();
    }
    // effect is intentionally not in deps — it captures fresh setters
    // via closure on every render but we only want to fire on key change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
