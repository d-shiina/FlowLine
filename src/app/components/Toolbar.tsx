import {
  Play,
  Square,
  Code2,
  Sun,
  Moon,
  Terminal,
} from 'lucide-react';
import type { Theme } from '../useTheme';

export type EditMode = 'block' | 'sync';

interface Props {
  playing: boolean;
  onTogglePlay: () => void;
  onOpenNodeEditor: () => void;
  nodeCount: number;
  theme: Theme;
  onToggleTheme: () => void;
  pythonState: 'ready' | 'missing' | 'unknown';
  onOpenPythonInstall: () => void;
  /** Current edit mode hint. */
  editMode: EditMode | null;
}

/**
 * Slim action bar below the titlebar.
 * Contains: run/stop, node editor, python status, theme toggle,
 * and an inline edit-mode hint.
 */
export function Toolbar({
  playing,
  onTogglePlay,
  onOpenNodeEditor,
  nodeCount,
  theme,
  onToggleTheme,
  pythonState,
  onOpenPythonInstall,
  editMode,
}: Props) {
  const chipBase =
    'flex items-center gap-1 rounded-md border border-fl-border-strong bg-fl-panel-2 px-2.5 py-1 font-mono text-[9px] font-bold text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text';

  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-fl-border bg-fl-panel px-4 py-1.5">
      {/* Run / stop */}
      <button
        type="button"
        onClick={onTogglePlay}
        className="flex items-center gap-1 rounded-md border px-3 py-1 font-mono text-[9px] font-bold transition-colors"
        style={{
          borderColor: playing ? '#ef4444' : '#22c55e',
          background: playing ? '#ef444418' : '#22c55e18',
          color: playing ? '#ef4444' : '#22c55e',
        }}
      >
        {playing ? (
          <>
            <Square className="h-2.5 w-2.5" /> 停止
          </>
        ) : (
          <>
            <Play className="h-2.5 w-2.5" /> 実行
          </>
        )}
      </button>

      <div className="mx-1 h-4 w-px bg-fl-border" />

      {/* Node editor */}
      <button
        type="button"
        onClick={onOpenNodeEditor}
        className={chipBase}
        title="Python ノードを編集 / 新規作成"
      >
        <Code2 className="h-2.5 w-2.5" /> ノード
        {nodeCount > 0 && (
          <span className="ml-0.5 rounded bg-fl-border-strong px-1 text-[8px] text-fl-text-dim">
            {nodeCount}
          </span>
        )}
      </button>

      {/* Python status */}
      <button
        type="button"
        onClick={onOpenPythonInstall}
        className="flex items-center gap-1 rounded-md border px-2.5 py-1 font-mono text-[9px] font-bold transition-colors"
        style={{
          borderColor:
            pythonState === 'ready'
              ? '#22c55e55'
              : pythonState === 'missing'
                ? '#f59e0b'
                : 'var(--fl-border-strong)',
          background:
            pythonState === 'ready'
              ? '#22c55e10'
              : pythonState === 'missing'
                ? '#f59e0b14'
                : 'var(--fl-panel-2)',
          color:
            pythonState === 'ready'
              ? '#22c55e'
              : pythonState === 'missing'
                ? '#f59e0b'
                : 'var(--fl-text-dim)',
        }}
        title={
          pythonState === 'ready'
            ? 'Python: OK'
            : pythonState === 'missing'
              ? 'Python: 未インストール'
              : 'Python: 確認中…'
        }
      >
        <Terminal className="h-2.5 w-2.5" />
        {pythonState === 'ready'
          ? '●'
          : pythonState === 'missing'
            ? '⚠'
            : '…'}
      </button>

      {/* Edit mode hint */}
      {editMode && (
        <>
          <div className="mx-1 h-4 w-px bg-fl-border" />
          <div
            className="font-mono text-[9px] font-bold"
            style={{
              color: editMode === 'block' ? '#3b82f6' : '#f43f5e',
            }}
          >
            {editMode === 'block'
              ? '▶ クリックでブロック配置'
              : '⬡ クリックで同期ポイント配置'}
          </div>
        </>
      )}

      {/* Right-aligned items */}
      <div className="ml-auto flex items-center gap-1.5">
        <span className="font-mono text-[8px] text-fl-text-ghost">
          Ctrl+Z=元に戻す / Del=削除
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-fl-border-strong bg-fl-panel-2 text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text"
          title={theme === 'dark' ? 'ライトテーマ' : 'ダークテーマ'}
        >
          {theme === 'dark' ? (
            <Sun className="h-2.5 w-2.5" />
          ) : (
            <Moon className="h-2.5 w-2.5" />
          )}
        </button>
      </div>
    </div>
  );
}
