import { useState, type ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Pencil, Trash2, Plus, Puzzle } from 'lucide-react';
import type { Subroutine } from '../types';

interface Props {
  subroutines: Subroutine[];
  activeId: string | null;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  /** Trigger button content. */
  children: ReactNode;
}

/**
 * Popover showing the scenario's subroutines. Invoked from the
 * StatusBar chip. Treats subroutines as scenario-scoped "custom nodes".
 */
export function SubroutinePopover({
  subroutines,
  activeId,
  onAdd,
  onEdit,
  onDelete,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="contents">{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} side="top" align="start" className="z-[300] outline-none">
          <Popover.Popup className="w-[320px] max-h-[420px] overflow-hidden rounded-lg border border-fl-border-strong bg-fl-modal shadow-2xl outline-none">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-fl-border bg-fl-panel px-3 py-2">
              <Puzzle className="h-3 w-3 text-fl-text-faint" />
              <span className="font-mono text-[10px] font-bold tracking-wider text-fl-text">
                サブルーチン
              </span>
              <span className="ml-auto font-mono text-[8px] text-fl-text-ghost">
                {subroutines.length}
              </span>
            </div>

            {/* List */}
            <div className="fl-scroll max-h-[300px] overflow-y-auto">
              {subroutines.length === 0 ? (
                <div className="py-8 text-center font-mono text-[9px] text-fl-text-ghost">
                  まだサブルーチンがありません
                </div>
              ) : (
                subroutines.map((sub) => {
                  const isActive = activeId === sub.id;
                  return (
                    <div
                      key={sub.id}
                      className="group flex items-center gap-2 border-b border-fl-border px-3 py-2 transition-colors hover:bg-fl-panel-2"
                      style={{
                        background: isActive ? '#3b82f618' : undefined,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onEdit(sub.id);
                          setOpen(false);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div
                          className="truncate font-mono text-[11px] font-bold"
                          style={{ color: isActive ? '#3b82f6' : 'var(--fl-text)' }}
                        >
                          {sub.name}
                        </div>
                        <div className="font-mono text-[8px] text-fl-text-ghost">
                          {sub.blocks.length} ブロック
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onEdit(sub.id);
                          setOpen(false);
                        }}
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-fl-text-ghost opacity-0 transition hover:bg-fl-border hover:text-fl-text group-hover:opacity-100"
                        title="編集"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`「${sub.name}」を削除しますか？`)) {
                            onDelete(sub.id);
                          }
                        }}
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-fl-text-ghost opacity-0 transition hover:bg-red-500/20 hover:text-red-500 group-hover:opacity-100"
                        title="削除"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer: add new */}
            <button
              type="button"
              onClick={() => {
                onAdd();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t border-fl-border bg-fl-panel px-3 py-2 text-left font-mono text-[10px] text-fl-text-faint transition-colors hover:bg-[#3b82f620] hover:text-[#3b82f6]"
            >
              <Plus className="h-3 w-3" />
              新規サブルーチン
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
