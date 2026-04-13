import {
  Play,
  Square,
  Sun,
  Moon,
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
  theme: Theme;
  onToggleTheme: () => void;
}

/**
 * Main action toolbar.
 * - Left: file operations (open / save / sample)
 * - Center: run button (prominent)
 * - Right: theme toggle
 *
 * Python status and node editor live in the bottom StatusBar.
 */
export function Toolbar({
  playing,
  onTogglePlay,
  onImport,
  onExport,
  onSample,
  theme,
  onToggleTheme,
}: Props) {
  const iconBtn =
    'flex h-7 items-center gap-1.5 rounded-md px-2.5 font-mono text-[10px] text-fl-text-faint transition-colors hover:bg-fl-panel-2 hover:text-fl-text';

  return (
    <div className="relative flex flex-shrink-0 items-center gap-1 border-b border-fl-border bg-fl-panel px-3 py-1.5">
      {/* Left: file ops */}
      <button type="button" onClick={onImport} className={iconBtn} title="開く (Ctrl+O)">
        <FolderOpen className="h-3 w-3" /> 開く
      </button>
      <button type="button" onClick={onExport} className={iconBtn} title="保存 (Ctrl+S)">
        <Save className="h-3 w-3" /> 保存
      </button>
      <button type="button" onClick={onSample} className={iconBtn} title="サンプルを読込">
        <BookOpen className="h-3 w-3" /> サンプル
      </button>

      {/* Center: run button (absolute, always centered) */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center">
        <button
          type="button"
          onClick={onTogglePlay}
          className="pointer-events-auto flex h-8 items-center gap-1.5 rounded-md border-[1.5px] px-5 font-mono text-[11px] font-bold shadow-sm transition-all hover:scale-[1.02] active:scale-95"
          style={{
            borderColor: playing ? '#ef4444' : '#22c55e',
            background: playing
              ? 'linear-gradient(180deg, #ef444433 0%, #ef444422 100%)'
              : 'linear-gradient(180deg, #22c55e33 0%, #22c55e22 100%)',
            color: playing ? '#ef4444' : '#22c55e',
            boxShadow: playing
              ? '0 0 12px #ef444444'
              : '0 0 12px #22c55e44',
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
      </div>

      {/* Right: theme */}
      <div className="ml-auto">
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
