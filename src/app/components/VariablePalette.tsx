import { useState } from 'react';
import { Variable, ChevronRight, ChevronDown } from 'lucide-react';

export type VariableOrigin = 'input' | 'output' | 'binding' | 'global';

export interface VariableEntry {
  key: string;
  origin: VariableOrigin;
}

export interface VariablePaletteProps {
  variables: VariableEntry[];
}

const ORIGIN_COLOR: Record<VariableOrigin, string> = {
  input: '#14b8a6', // teal
  output: '#a855f7', // purple
  binding: '#6366f1', // indigo
  global: '#f59e0b', // amber
};

const ORIGIN_LABEL: Record<VariableOrigin, string> = {
  input: '入力',
  output: '出力',
  binding: 'ローカル',
  global: 'グローバル',
};

/**
 * Read-only reference panel showing variables in scope for this block.
 *
 * Grouped by origin (inputs / local bindings / outputs / global). The
 * user edits actual bindings via the text inputs on each step's port
 * row — the palette is just a cheat sheet for "what variables exist
 * in this flowchart" so the user doesn't have to remember them.
 *
 * (An earlier drag-to-bind interaction was removed because it was
 * confusing: dragging looked like it should draw a wire, but the
 * drop only updated a text field invisibly.)
 */
export function VariablePalette({ variables }: VariablePaletteProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Group variables by origin for a tidier display.
  const grouped: Record<VariableOrigin, VariableEntry[]> = {
    input: [],
    output: [],
    binding: [],
    global: [],
  };
  for (const v of variables) grouped[v.origin].push(v);

  return (
    <div
      className="absolute top-16 left-4 z-20 rounded-lg border border-fl-border bg-fl-panel shadow-lg backdrop-blur-sm"
      style={{ width: collapsed ? 'auto' : 220 }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-1.5 rounded-t-lg px-2.5 py-1.5 transition-colors hover:bg-fl-panel-2"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-fl-text-faint" />
        ) : (
          <ChevronDown className="h-3 w-3 text-fl-text-faint" />
        )}
        <Variable className="h-3 w-3" style={{ color: '#6366f1' }} />
        <span className="font-mono text-[10px] font-bold tracking-wider text-fl-text-dim">
          VARIABLES
        </span>
        <span className="ml-auto rounded-full bg-fl-panel-2 px-1.5 py-px font-mono text-[8px] text-fl-text-faint">
          {variables.length}
        </span>
      </button>

      {!collapsed && (
        <div className="max-h-[340px] overflow-y-auto border-t border-fl-border p-2">
          {variables.length === 0 ? (
            <div className="py-2 text-center font-mono text-[8px] text-fl-text-ghost">
              変数なし
            </div>
          ) : (
            (['input', 'binding', 'output', 'global'] as VariableOrigin[]).map((origin) => {
              const list = grouped[origin];
              if (list.length === 0) return null;
              return (
                <div key={origin} className="mb-1.5 last:mb-0">
                  <div
                    className="mb-0.5 px-1 font-mono text-[8px] font-bold uppercase tracking-wider"
                    style={{ color: ORIGIN_COLOR[origin] }}
                  >
                    {ORIGIN_LABEL[origin]}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {list.map((v) => (
                      <div
                        key={v.key}
                        className="flex items-center gap-1.5 rounded border border-fl-border bg-fl-panel-2 px-1.5 py-1"
                      >
                        <span
                          className="h-[6px] w-[6px] flex-shrink-0 rounded-full"
                          style={{
                            background: ORIGIN_COLOR[origin],
                            boxShadow: `0 0 4px ${ORIGIN_COLOR[origin]}66`,
                          }}
                        />
                        <span
                          className="flex-1 truncate font-mono text-[9px] text-fl-text-dim"
                          title={v.key}
                        >
                          {v.key}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
