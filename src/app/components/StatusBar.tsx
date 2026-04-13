import { Terminal, Code2, Variable, Activity, Puzzle } from 'lucide-react';
import type { ExecutionPhase } from '../engine';
import type { Subroutine } from '../types';
import { SubroutinePopover } from './SubroutinePopover';

interface Props {
  pythonState: 'ready' | 'missing' | 'unknown';
  onOpenPythonInstall: () => void;
  nodeCount: number;
  onOpenNodeEditor: () => void;
  variableCount: number;
  phase: ExecutionPhase;
  // Subroutines
  subroutines: Subroutine[];
  activeSubroutineId: string | null;
  onAddSubroutine: () => void;
  onEditSubroutine: (id: string) => void;
  onDeleteSubroutine: (id: string) => void;
}

const PHASE_LABEL: Record<ExecutionPhase, string> = {
  idle: 'アイドル',
  running: '実行中',
  'error-handler': 'エラー処理',
  done: '完了',
  aborted: '中止',
};

const PHASE_COLOR: Record<ExecutionPhase, string> = {
  idle: 'var(--fl-text-ghost)',
  running: '#22c55e',
  'error-handler': '#f59e0b',
  done: '#22c55e',
  aborted: '#ef4444',
};

/**
 * VSCode-style status bar at the very bottom of the window.
 * Shows runtime state, counts, and the execution phase.
 */
export function StatusBar({
  pythonState,
  onOpenPythonInstall,
  nodeCount,
  onOpenNodeEditor,
  variableCount,
  phase,
  subroutines,
  activeSubroutineId,
  onAddSubroutine,
  onEditSubroutine,
  onDeleteSubroutine,
}: Props) {
  const itemClass =
    'flex h-full items-center gap-1 px-2 font-mono text-[9px] transition-colors hover:bg-fl-panel-2';

  const pythonColor =
    pythonState === 'ready'
      ? '#22c55e'
      : pythonState === 'missing'
        ? '#f59e0b'
        : 'var(--fl-text-ghost)';

  const pythonLabel =
    pythonState === 'ready'
      ? 'Python OK'
      : pythonState === 'missing'
        ? 'Python 未インストール'
        : 'Python 確認中…';

  return (
    <div className="flex h-6 flex-shrink-0 items-center border-t border-fl-border bg-fl-panel">
      {/* Left cluster */}
      <button
        type="button"
        onClick={onOpenPythonInstall}
        className={itemClass}
        style={{ color: pythonColor }}
        title={pythonLabel}
      >
        <Terminal className="h-2.5 w-2.5" />
        <span>{pythonLabel}</span>
      </button>

      <button
        type="button"
        onClick={onOpenNodeEditor}
        className={itemClass + ' text-fl-text-faint'}
        title="ノードエディタを開く"
      >
        <Code2 className="h-2.5 w-2.5" />
        <span>{nodeCount} ノード</span>
      </button>

      {/* Subroutines — scenario-scoped custom nodes */}
      <SubroutinePopover
        subroutines={subroutines}
        activeId={activeSubroutineId}
        onAdd={onAddSubroutine}
        onEdit={onEditSubroutine}
        onDelete={onDeleteSubroutine}
      >
        <button
          type="button"
          className={itemClass + ' text-fl-text-faint'}
          title="サブルーチンを管理"
        >
          <Puzzle className="h-2.5 w-2.5" />
          <span>{subroutines.length} サブルーチン</span>
        </button>
      </SubroutinePopover>

      <div className={itemClass + ' text-fl-text-faint pointer-events-none'}>
        <Variable className="h-2.5 w-2.5" />
        <span>{variableCount} 変数</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right cluster */}
      <div
        className="flex h-full items-center gap-1 px-2 font-mono text-[9px] font-bold"
        style={{ color: PHASE_COLOR[phase] }}
      >
        <Activity className="h-2.5 w-2.5" />
        <span>{PHASE_LABEL[phase]}</span>
        {phase === 'running' && (
          <span
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ background: PHASE_COLOR[phase] }}
          />
        )}
      </div>
    </div>
  );
}
