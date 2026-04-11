import { useState } from 'react';
import { Box as BoxIcon, Plus, Trash2 } from 'lucide-react';
import type { Subroutine } from '../types';

interface Props {
  subroutines: Subroutine[];
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Left sidebar listing subroutine definitions. Subroutines are reusable
 * block sequences that can be called from any track via a `subroutine`
 * block (see Inspector / AddBlockModal for the call site).
 *
 * For Phase 1 we show the list, let users create/rename/delete entries,
 * and track how many blocks each one contains. The in-place subroutine
 * editor (editing the blocks inside a subroutine) is a future feature.
 */
export function SubroutineSidebar({
  subroutines,
  onAdd,
  onRename,
  onDelete,
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
    <aside className="fl-scroll flex h-full w-56 flex-shrink-0 flex-col gap-2 overflow-y-auto border-r border-[#0f172a] bg-[#0a1020] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider text-[#94a3b8]">
          <BoxIcon className="h-3 w-3" />
          サブルーチン
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setDraft('');
          }}
          className="flex h-4 w-4 items-center justify-center rounded border border-[#334155] text-slate-500 transition-colors hover:border-[#94a3b8] hover:text-[#94a3b8]"
          title="新規サブルーチン"
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      </div>

      {subroutines.length === 0 && !creating && (
        <div className="rounded-md border border-dashed border-[#1e293b] p-3 text-center font-mono text-[9px] leading-relaxed text-slate-700">
          未定義
          <br />+ で作成
        </div>
      )}

      <div className="flex flex-col gap-1">
        {subroutines.map((sub) => (
          <div
            key={sub.id}
            className="group flex items-center gap-1 rounded-md border border-[#1e293b] bg-[#0f172a] px-2 py-1.5 transition-colors hover:border-[#334155]"
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
                className="flex-1 bg-transparent font-mono text-[10px] text-slate-200 outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingId(sub.id);
                  setEditVal(sub.name);
                }}
                className="flex-1 truncate text-left font-mono text-[10px] text-slate-300 hover:text-slate-100"
                title="クリックで名前変更"
              >
                {sub.name}
              </button>
            )}
            <span className="font-mono text-[8px] text-slate-600">
              {sub.blocks.length}
            </span>
            <button
              type="button"
              onClick={() => onDelete(sub.id)}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              title="削除"
            >
              <Trash2 className="h-2.5 w-2.5 text-slate-600 hover:text-red-500" />
            </button>
          </div>
        ))}

        {creating && (
          <div className="flex items-center gap-1 rounded-md border border-[#3B82F6] bg-[#0f172a] px-2 py-1.5">
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
              className="flex-1 bg-transparent font-mono text-[10px] text-slate-200 placeholder-slate-700 outline-none"
            />
          </div>
        )}
      </div>

      <div className="mt-auto font-mono text-[8px] leading-relaxed text-slate-700">
        サブルーチンはタイムライン上で
        <br />
        サブルーチン ブロックとして呼び出せます
      </div>
    </aside>
  );
}
