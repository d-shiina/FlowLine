import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { Select, type SelectOption } from './ui/Select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current scenario-scope variables keyed by flat name (no prefix). */
  variables: Record<string, unknown>;
  onSet: (key: string, value: unknown) => void;
  onRename: (oldKey: string, newKey: string) => void;
  onDelete: (key: string) => void;
}

type VariableType = 'string' | 'number' | 'boolean' | 'json';

const TYPE_OPTIONS: SelectOption<VariableType>[] = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'json', label: 'json' },
];

/** Guess the editor type from an existing value. */
function inferType(value: unknown): VariableType {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'json';
}

/** Serialize a value to the string the editor input displays. */
function toDisplay(value: unknown, type: VariableType): string {
  if (value === undefined || value === null) return '';
  if (type === 'json') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Parse a display string back to the runtime value. Returns `undefined` on failure. */
function fromDisplay(raw: string, type: VariableType): unknown | undefined {
  if (type === 'string') return raw;
  if (type === 'number') {
    if (raw.trim() === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === 'boolean') {
    const t = raw.trim().toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
    return undefined;
  }
  // json
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Scenario-level variable store editor.
 *
 * Lists every key in ``scenario.variables.scenario`` and lets the
 * user add, rename, retype, edit or delete entries. Values live
 * under the ``scenario.`` prefix at runtime (so a row labelled
 * ``target`` shows up in the Inspector bindings as
 * ``scenario.target``). The modal commits edits on blur / change so
 * there's no separate save button — consistent with the rest of
 * the app's live-apply feel.
 */
export function VariablesModal({
  open,
  onOpenChange,
  variables,
  onSet,
  onRename,
  onDelete,
}: Props) {
  const entries = useMemo(
    () => Object.entries(variables).sort(([a], [b]) => a.localeCompare(b)),
    [variables],
  );

  const [draftKey, setDraftKey] = useState('');
  const [draftType, setDraftType] = useState<VariableType>('string');
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
    const parsed = fromDisplay(draftValue, draftType);
    if (parsed === undefined && draftType !== 'string') {
      setDraftError(`${draftType} として解釈できませんでした`);
      return;
    }
    onSet(key, draftType === 'string' ? draftValue : parsed);
    setDraftKey('');
    setDraftValue('');
    setDraftType('string');
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
            設定した値は <span className="text-fl-text-dim">scenario.キー</span> でアクセスできます。
          </Dialog.Description>

          {/* Existing rows */}
          <div className="fl-scroll mb-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-lg border border-fl-border bg-fl-panel-2 p-2">
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
                  onRename={(next) => onRename(key, next)}
                  onValueChange={(next) => onSet(key, next)}
                  onDelete={() => onDelete(key)}
                />
              ))
            )}
          </div>

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
              <div style={{ width: 88 }}>
                <Select<VariableType>
                  value={draftType}
                  onValueChange={(t) => {
                    setDraftType(t);
                    setDraftError(null);
                  }}
                  options={TYPE_OPTIONS}
                />
              </div>
              <input
                value={draftValue}
                onChange={(e) => {
                  setDraftValue(e.target.value);
                  setDraftError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                }}
                placeholder={draftType === 'json' ? '{"x": 1}' : '値'}
                className="min-w-0 flex-1 rounded border border-fl-border-2 bg-fl-bg px-2 py-1 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-fl-text-dim"
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
  onRename: (next: string) => void;
  onValueChange: (next: unknown) => void;
  onDelete: () => void;
}

function VariableRow({
  name,
  value,
  onRename,
  onValueChange,
  onDelete,
}: RowProps) {
  const [localKey, setLocalKey] = useState(name);
  const [type, setType] = useState<VariableType>(() => inferType(value));
  const [local, setLocal] = useState<string>(() => toDisplay(value, inferType(value)));
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the external value changes (undo/redo, scenario load).
  // We only resync when the *name* changes so typing inside the input
  // doesn't fight the user.
  useKeyChangeEffect(name, () => {
    setLocalKey(name);
    const inferred = inferType(value);
    setType(inferred);
    setLocal(toDisplay(value, inferred));
    setError(null);
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
    if (type === 'string') {
      onValueChange(local);
      setError(null);
      return;
    }
    const parsed = fromDisplay(local, type);
    if (parsed === undefined) {
      setError(`${type} として解釈できません`);
      return;
    }
    onValueChange(parsed);
    setError(null);
  };

  const retype = (next: VariableType) => {
    setType(next);
    // Attempt a best-effort conversion of the current display string
    // to the new type. Falls back to the empty value on failure.
    const parsed = fromDisplay(local, next);
    if (parsed !== undefined) {
      onValueChange(next === 'string' ? local : parsed);
      setError(null);
    } else {
      setError(`${next} として解釈できません`);
    }
  };

  return (
    <div className="group flex flex-col gap-1 rounded border border-fl-border-2 bg-fl-bg px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <input
          value={localKey}
          onChange={(e) => setLocalKey(e.target.value)}
          onBlur={commitKey}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'Escape') {
              setLocalKey(name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="min-w-0 flex-[1.2] bg-transparent font-mono text-[10px] text-fl-text outline-none"
        />
        <div style={{ width: 88 }}>
          <Select<VariableType>
            value={type}
            onValueChange={retype}
            options={TYPE_OPTIONS}
          />
        </div>
        <input
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            setError(null);
          }}
          onBlur={commitValue}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="min-w-0 flex-1 rounded border border-fl-border-2 bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none focus:border-fl-text-dim"
        />
        <button
          type="button"
          onClick={onDelete}
          className="flex-shrink-0 text-fl-text-faint transition-colors opacity-0 group-hover:opacity-100 hover:text-red-500"
          title="削除"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {error && (
        <div className="pl-1 font-mono text-[9px] text-[#ef4444]">{error}</div>
      )}
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
