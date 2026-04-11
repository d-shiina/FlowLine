import {
  Play,
  Square,
  Plus,
  Upload,
  Download,
  Hexagon,
  Box,
  BookOpen,
  Undo2,
  Redo2,
  Link2,
  Sun,
  Moon,
} from 'lucide-react';
import type { Theme } from '../useTheme';

export type EditMode = 'block' | 'sync' | 'link';

interface Props {
  mode: EditMode;
  onModeChange: (m: EditMode) => void;
  playing: boolean;
  onTogglePlay: () => void;
  onAddTrack: () => void;
  onImport: () => void;
  onExport: () => void;
  onSample: () => void;
  scenarioName: string;
  onRenameScenario: (name: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function Toolbar({
  mode,
  onModeChange,
  playing,
  onTogglePlay,
  onAddTrack,
  onImport,
  onExport,
  onSample,
  scenarioName,
  onRenameScenario,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  theme,
  onToggleTheme,
}: Props) {
  const chipBase =
    'flex items-center gap-1 rounded-lg border-[1.5px] border-fl-border-strong bg-fl-panel-2 px-3 py-1.5 font-mono text-[10px] font-bold text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text';

  return (
    <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-fl-border bg-fl-panel px-5 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#525763] to-[#8d93a0] text-[13px]">
          <Play className="h-3.5 w-3.5 fill-white stroke-white" />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="text-[13px] font-bold tracking-wider text-fl-text">
            FLOWLINE
          </div>
          <input
            value={scenarioName}
            onChange={(e) => onRenameScenario(e.target.value)}
            placeholder="シナリオ名"
            className="w-44 truncate bg-transparent font-mono text-[10px] text-fl-text-dim outline-none placeholder:text-fl-text-ghost focus:text-fl-text"
            title="シナリオ名 (クリックで編集)"
          />
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-fl-border-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="flex items-center gap-1 border-r border-fl-border-2 bg-fl-panel-2 px-2.5 py-1.5 font-mono text-[10px] font-bold text-fl-text-dim transition-colors hover:text-fl-text disabled:cursor-not-allowed disabled:text-fl-text-ghost disabled:hover:text-fl-text-ghost"
            title="元に戻す (Ctrl+Z)"
          >
            <Undo2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="flex items-center gap-1 bg-fl-panel-2 px-2.5 py-1.5 font-mono text-[10px] font-bold text-fl-text-dim transition-colors hover:text-fl-text disabled:cursor-not-allowed disabled:text-fl-text-ghost disabled:hover:text-fl-text-ghost"
            title="やり直し (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-3 w-3" />
          </button>
        </div>

        <div className="flex overflow-hidden rounded-lg border border-fl-border-2 bg-fl-panel-2">
          <button
            type="button"
            onClick={() => onModeChange('block')}
            className="flex items-center gap-1 border-r border-fl-border-2 px-3 py-1.5 font-mono text-[10px] font-bold transition-colors"
            style={{
              background: mode === 'block' ? '#3b82f620' : 'transparent',
              color: mode === 'block' ? '#3b82f6' : 'var(--fl-text-faint)',
            }}
          >
            <Box className="h-3 w-3" /> ブロック追加
          </button>
          <button
            type="button"
            onClick={() => onModeChange('link')}
            className="flex items-center gap-1 border-r border-fl-border-2 px-3 py-1.5 font-mono text-[10px] font-bold transition-colors"
            style={{
              background: mode === 'link' ? '#60a5fa20' : 'transparent',
              color: mode === 'link' ? '#60a5fa' : 'var(--fl-text-faint)',
            }}
            title="2つのブロックをクリックして依存関係を作成"
          >
            <Link2 className="h-3 w-3" /> 依存リンク
          </button>
          <button
            type="button"
            onClick={() => onModeChange('sync')}
            className="flex items-center gap-1 px-3 py-1.5 font-mono text-[10px] font-bold transition-colors"
            style={{
              background: mode === 'sync' ? '#f43f5e20' : 'transparent',
              color: mode === 'sync' ? '#f43f5e' : 'var(--fl-text-faint)',
            }}
          >
            <Hexagon className="h-3 w-3" /> 同期ポイント
          </button>
        </div>

        <button type="button" onClick={onAddTrack} className={chipBase}>
          <Plus className="h-3 w-3" /> トラック
        </button>

        <button
          type="button"
          onClick={onSample}
          className={chipBase}
          title="サンプルシナリオを読込"
        >
          <BookOpen className="h-3 w-3" /> サンプル
        </button>

        <button
          type="button"
          onClick={onImport}
          className={chipBase}
          title="JSONを読み込み (Ctrl+O)"
        >
          <Upload className="h-3 w-3" /> 読込
        </button>
        <button
          type="button"
          onClick={onExport}
          className={chipBase}
          title="JSONを保存 (Ctrl+S)"
        >
          <Download className="h-3 w-3" /> 保存
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="flex h-7 w-7 items-center justify-center rounded-lg border-[1.5px] border-fl-border-strong bg-fl-panel-2 text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text"
          title={theme === 'dark' ? 'ライトテーマに切替' : 'ダークテーマに切替'}
        >
          {theme === 'dark' ? (
            <Sun className="h-3 w-3" />
          ) : (
            <Moon className="h-3 w-3" />
          )}
        </button>

        <button
          type="button"
          onClick={onTogglePlay}
          className="flex items-center gap-1 rounded-lg border-[1.5px] px-4 py-1.5 font-mono text-[10px] font-bold transition-colors"
          style={{
            borderColor: playing ? '#ef4444' : '#22c55e',
            background: playing ? '#ef444418' : '#22c55e18',
            color: playing ? '#ef4444' : '#22c55e',
          }}
        >
          {playing ? (
            <>
              <Square className="h-3 w-3" /> 停止
            </>
          ) : (
            <>
              <Play className="h-3 w-3" /> 実行
            </>
          )}
        </button>
      </div>
    </div>
  );
}
