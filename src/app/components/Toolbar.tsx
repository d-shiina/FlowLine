import {
  Play,
  Square,
  Upload,
  Download,
  BookOpen,
  Sun,
  Moon,
} from 'lucide-react';
import type { Theme } from '../useTheme';

export type EditMode = 'block' | 'sync' | 'link';

interface Props {
  playing: boolean;
  onTogglePlay: () => void;
  onImport: () => void;
  onExport: () => void;
  onSample: () => void;
  scenarioName: string;
  onRenameScenario: (name: string) => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function Toolbar({
  playing,
  onTogglePlay,
  onImport,
  onExport,
  onSample,
  scenarioName,
  onRenameScenario,
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
