import { useState } from 'react';
import { Box as BoxIcon, Plus, Trash2, PencilLine } from 'lucide-react';
import type { Subroutine } from '../types';

interface Props {
  subroutines: Subroutine[];
  activeSubroutineId: string | null;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}

/**
 * Left sidebar listing subroutine definitions. Clicking a subroutine
 * opens the internal editor, which swaps the main canvas for that
 * subroutine's single-track view.
 */
export function SubroutineSidebar({
  subroutines,
  activeSubroutineId,
  onAdd,
  onRename,
  onDelete,
  onOpen,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  const commitCreate = () => {
    const name = draft.trim();
    if (name) onAdd(name);
    setDraft('');
    setCreating(false);
  };

  const commitRename = (id: string) => {
    onRename(id, editVal);
    setEditingId(null);
  };

  return (
    <aside className="fl-scroll flex h-full w-56 flex-shrink-0 flex-col gap-2 overflow-y-auto border-r border-fl-border bg-fl-panel p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider text-fl-text-dim">
          <BoxIcon className="h-3 w-3" />
          サブルーチン
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setDraft('');
          }}
          className="flex h-4 w-4 items-center justify-center rounded border border-fl-border-strong text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text"
          title="新規サブルーチン"
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      </div>

      {subroutines.length === 0 && !creating && (
        <div className="rounded-md border border-dashed border-fl-border-2 p-3 text-center font-mono text-[9px] leading-relaxed text-fl-text-ghost">
          未定義
          <br />+ で作成
        </div>
      )}

      <div className="flex flex-col gap-1">
        {subroutines.map((sub) => {
          const active = activeSubroutineId === sub.id;
          return (
            <div
              key={sub.id}
              className="group flex items-center gap-1 rounded-md border px-2 py-1.5 transition-colors"
              style={{
                borderColor: active ? '#60a5fa' : 'var(--fl-border-2)',
                background: active ? '#60a5fa18' : 'var(--fl-panel-2)',
              }}
            >
              {editingId === sub.id ? (
                <input
                  autoFocus
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={() => commitRename(sub.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(sub.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 bg-transparent font-mono text-[10px] text-fl-text outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onOpen(sub.id)}
                  onDoubleClick={() => {
                    setEditingId(sub.id);
                    setEditVal(sub.name);
                  }}
                  className="flex-1 truncate text-left font-mono text-[10px]"
                  style={{
                    color: active ? '#60a5fa' : 'var(--fl-text-muted)',
                  }}
                  title="クリックで開く / ダブルクリックで名前変更"
                >
                  {sub.name}
                </button>
              )}
              <span className="font-mono text-[8px] text-fl-text-faint">
                {sub.blocks.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingId(sub.id);
                  setEditVal(sub.name);
                }}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                title="名前変更"
              >
                <PencilLine className="h-2.5 w-2.5 text-fl-text-faint hover:text-fl-text" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(sub.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                title="削除"
              >
                <Trash2 className="h-2.5 w-2.5 text-fl-text-faint hover:text-red-500" />
              </button>
            </div>
          );
        })}

        {creating && (
          <div className="flex items-center gap-1 rounded-md border border-[#3b82f6] bg-fl-panel-2 px-2 py-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setDraft('');
                }
              }}
              placeholder="サブルーチン名"
              className="flex-1 bg-transparent font-mono text-[10px] text-fl-text placeholder:text-fl-text-ghost outline-none"
            />
          </div>
        )}
      </div>

      <div className="mt-auto font-mono text-[8px] leading-relaxed text-fl-text-ghost">
        クリックで内部エディタを開き、
        <br />
        サブルーチンのブロックを編集できます
      </div>
    </aside>
  );
}
