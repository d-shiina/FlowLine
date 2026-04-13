import {
  Play,
  Square,
  Code2,
  Sun,
  Moon,
  Terminal,
  FolderOpen,
  Save,
  BookOpen,
} from 'lucide-react';
import type { Theme } from '../useTheme';

export type EditMode = 'block' | 'sync';

interface Props {
  playing: boolean;
  onTogglePlay: () => void;
  onImport: () => void;
  onExport: () => void;
  onSample: () => void;
  onOpenNodeEditor: () => void;
  nodeCount: number;
  theme: Theme;
  onToggleTheme: () => void;
  pythonState: 'ready' | 'missing' | 'unknown';
  onOpenPythonInstall: () => void;
}

/**
 * Main action toolbar: file ops, run, node editor, python status, theme.
 */
export function Toolbar({
  playing,
  onTogglePlay,
  onImport,
  onExport,
  onSample,
  onOpenNodeEditor,
  nodeCount,
  theme,
  onToggleTheme,
  pythonState,
  onOpenPythonInstall,
}: Props) {
  const iconBtn =
    'flex h-7 items-center gap-1.5 rounded-md px-2.5 font-mono text-[10px] text-fl-text-faint transition-colors hover:bg-fl-panel-2 hover:text-fl-text';

  const sep = <div className="mx-1 h-4 w-px bg-fl-border" />;

  return (
    <div className="flex flex-shrink-0 items-center gap-1 border-b border-fl-border bg-fl-panel px-3 py-1.5">
      {/* File ops */}
      <button type="button" onClick={onImport} className={iconBtn} title="開く (Ctrl+O)">
        <FolderOpen className="h-3 w-3" /> 開く
      </button>
      <button type="button" onClick={onExport} className={iconBtn} title="保存 (Ctrl+S)">
        <Save className="h-3 w-3" /> 保存
      </button>
      <button type="button" onClick={onSample} className={iconBtn} title="サンプルを読込">
        <BookOpen className="h-3 w-3" /> サンプル
      </button>

      {sep}

      {/* Run / stop — prominent */}
      <button
        type="button"
        onClick={onTogglePlay}
        className="flex h-7 items-center gap-1.5 rounded-md border px-3 font-mono text-[10px] font-bold transition-all"
        style={{
          borderColor: playing ? '#ef4444' : '#22c55e',
          background: playing ? '#ef444422' : '#22c55e22',
          color: playing ? '#ef4444' : '#22c55e',
        }}
      >
        {playing ? (
          <>
            <Square className="h-3 w-3 fill-current" /> 停止
          </>
        ) : (
          <>
            <Play className="h-3 w-3 fill-current" /> 実行
          </>
        )}
      </button>

      {sep}

      {/* Node editor */}
      <button
        type="button"
        onClick={onOpenNodeEditor}
        className={iconBtn}
        title="Python ノードを編集 / 新規作成"
      >
        <Code2 className="h-3 w-3" /> ノード
        {nodeCount > 0 && (
          <span className="rounded bg-fl-border-strong px-1 font-mono text-[8px] text-fl-text-dim">
            {nodeCount}
          </span>
        )}
      </button>

      {/* Python status */}
      <button
        type="button"
        onClick={onOpenPythonInstall}
        className="flex h-7 items-center gap-1 rounded-md px-2 font-mono text-[10px] font-bold transition-colors"
        style={{
          color:
            pythonState === 'ready'
              ? '#22c55e'
              : pythonState === 'missing'
                ? '#f59e0b'
                : 'var(--fl-text-ghost)',
        }}
        title={
          pythonState === 'ready'
            ? 'Python: OK'
            : pythonState === 'missing'
              ? 'Python: 未インストール'
              : 'Python: 確認中…'
        }
      >
        <Terminal className="h-3 w-3" />
        <span>
          {pythonState === 'ready' ? '●' : pythonState === 'missing' ? '⚠' : '…'}
        </span>
      </button>

      {/* Right-aligned */}
      <div className="ml-auto flex items-center gap-2">
        <span className="font-mono text-[8px] text-fl-text-ghost">
          Ctrl+Z=元に戻す / Del=削除
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          className="flex h-7 w-7 items-center justify-center rounded-md text-fl-text-faint transition-colors hover:bg-fl-panel-2 hover:text-fl-text"
          title={theme === 'dark' ? 'ライトテーマ' : 'ダークテーマ'}
        >
          {theme === 'dark' ? (
            <Sun className="h-3 w-3" />
          ) : (
            <Moon className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  );
}
