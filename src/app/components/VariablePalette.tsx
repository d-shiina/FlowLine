import { useEffect, useState } from 'react';
import { Variable, ChevronRight, ChevronDown } from 'lucide-react';

export type VariableOrigin = 'input' | 'output' | 'binding' | 'global';

export interface VariableEntry {
  key: string;
  origin: VariableOrigin;
}

export interface VariablePaletteProps {
  variables: VariableEntry[];
  /**
   * Called when the user drops a variable chip onto a data-port handle.
   * The handler should update step.bindings[portName] to bind the
   * port to the dropped var key.
   */
  onBindToPort: (nodeId: string, portName: string, varKey: string) => void;
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
 * Floating palette of variables in scope for the current flowchart.
 *
 * The user can drag a chip from this panel onto any data-port handle
 * on the canvas (the round colored dots inside step nodes). Dropping
 * sets that step's port binding to the dragged var key.
 *
 * "In scope" = referenced anywhere in this block (step bindings, or
 * declared as a block input/output). We do NOT enumerate all global
 * scenario variables — that becomes noise quickly.
 */
export function VariablePalette({ variables, onBindToPort }: VariablePaletteProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState<{
    varKey: string;
    origin: { x: number; y: number };
    cursor: { x: number; y: number };
  } | null>(null);

  // Document-level mouse tracking while a chip is being dragged.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setDragging((d) =>
        d ? { ...d, cursor: { x: e.clientX, y: e.clientY } } : null,
      );
    };
    const onUp = (e: MouseEvent) => {
      // Find the handle DOM under the cursor.
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const handle = target?.closest('.react-flow__handle') as HTMLElement | null;
      if (handle) {
        const portName = handle.getAttribute('data-handleid');
        const nodeId = handle.getAttribute('data-nodeid');
        // Skip exec handles and missing ids — only data ports accept var binds.
        if (
          portName &&
          nodeId &&
          portName !== '__exec__' &&
          portName !== '__default__'
        ) {
          onBindToPort(nodeId, portName, dragging.varKey);
        }
      }
      setDragging(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging, onBindToPort]);

  const startDrag = (varKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const point = { x: e.clientX, y: e.clientY };
    setDragging({ varKey, origin: point, cursor: point });
  };

  // Group variables by origin for a tidier display.
  const grouped: Record<VariableOrigin, VariableEntry[]> = {
    input: [],
    output: [],
    binding: [],
    global: [],
  };
  for (const v of variables) grouped[v.origin].push(v);

  return (
    <>
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
                          onMouseDown={(e) => startDrag(v.key, e)}
                          className="group flex cursor-grab items-center gap-1.5 rounded border border-fl-border bg-fl-panel-2 px-1.5 py-1 transition-all hover:border-[color:var(--var-accent)] hover:bg-fl-bg active:cursor-grabbing"
                          style={
                            { '--var-accent': ORIGIN_COLOR[origin] } as React.CSSProperties
                          }
                          title={`ドラッグしてポートに接続: ${v.key}`}
                        >
                          <span
                            className="h-[6px] w-[6px] flex-shrink-0 rounded-full"
                            style={{
                              background: ORIGIN_COLOR[origin],
                              boxShadow: `0 0 4px ${ORIGIN_COLOR[origin]}66`,
                            }}
                          />
                          <span className="flex-1 truncate font-mono text-[9px] text-fl-text-dim group-hover:text-fl-text">
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

      {/* Ghost wire while dragging */}
      {dragging && (
        <svg
          className="pointer-events-none fixed inset-0 z-50"
          width="100%"
          height="100%"
          style={{ overflow: 'visible' }}
        >
          <line
            x1={dragging.origin.x}
            y1={dragging.origin.y}
            x2={dragging.cursor.x}
            y2={dragging.cursor.y}
            stroke="#6366f1"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray="5 4"
            opacity={0.85}
          />
          <circle
            cx={dragging.cursor.x}
            cy={dragging.cursor.y}
            r={5}
            fill="#6366f1"
            opacity={0.9}
          />
          <circle
            cx={dragging.cursor.x}
            cy={dragging.cursor.y}
            r={9}
            fill="#6366f1"
            opacity={0.25}
          />
        </svg>
      )}
    </>
  );
}
