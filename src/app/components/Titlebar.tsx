import { useEffect, useState } from 'react';
import {
  Minus,
  Square,
  Copy,
  X,
  FolderOpen,
  Save,
  BookOpen,
  ChevronDown,
} from 'lucide-react';

interface Props {
  scenarioName: string;
  onRenameScenario: (name: string) => void;
  onImport: () => void;
  onExport: () => void;
  onSample: () => void;
}

/**
 * Custom titlebar for the frameless Electron window.
 *
 * Left: FLOWLINE logo + scenario name (editable)
 * Center: file operations (open / save / sample)
 * Right: window controls (minimize / maximize / close)
 */
export function Titlebar({
  scenarioName,
  onRenameScenario,
  onImport,
  onExport,
  onSample,
}: Props) {
  const api = typeof window !== 'undefined' ? window.flowlineWindow : undefined;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api) return;
    api
      .isMaximized()
      .then((v) => setMaximized(v))
      .catch(() => {});
    const unsub = api.onMaximizedChange(setMaximized);
    return () => unsub();
  }, [api]);

  const actionBtn =
    'flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[9px] text-fl-text-faint transition-colors hover:bg-fl-panel-2 hover:text-fl-text';

  return (
    <div
      className="flex h-9 flex-shrink-0 items-center border-b border-fl-border bg-fl-panel"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: logo + scenario name */}
      <div
        className="flex items-center gap-2 pl-3"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className="font-mono text-[11px] font-bold tracking-wider text-fl-text-dim">
          FL
        </span>
        <span className="text-fl-text-ghost">|</span>
        <input
          value={scenarioName}
          onChange={(e) => onRenameScenario(e.target.value)}
          placeholder="シナリオ名"
          className="w-40 truncate bg-transparent font-mono text-[10px] text-fl-text-muted outline-none placeholder:text-fl-text-ghost focus:text-fl-text"
          title="シナリオ名 (クリックで編集)"
        />
      </div>

      {/* Center: file operations */}
      <div
        className="flex items-center gap-0.5 pl-4"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={onImport}
          className={actionBtn}
          title="開く (Ctrl+O)"
        >
          <FolderOpen className="h-3 w-3" /> 開く
        </button>
        <button
          type="button"
          onClick={onExport}
          className={actionBtn}
          title="保存 (Ctrl+S)"
        >
          <Save className="h-3 w-3" /> 保存
        </button>
        <button
          type="button"
          onClick={onSample}
          className={actionBtn}
          title="サンプルを読込"
        >
          <BookOpen className="h-3 w-3" /> サンプル
        </button>
      </div>

      {/* Spacer (draggable) */}
      <div className="flex-1" />

      {/* Right: window controls */}
      {api && (
        <div
          className="flex h-full"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() => void api.minimize()}
            className="flex h-full w-10 items-center justify-center text-fl-text-dim transition-colors hover:bg-fl-panel-2 hover:text-fl-text"
            title="最小化"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => void api.toggleMaximize()}
            className="flex h-full w-10 items-center justify-center text-fl-text-dim transition-colors hover:bg-fl-panel-2 hover:text-fl-text"
            title={maximized ? '元のサイズに戻す' : '最大化'}
          >
            {maximized ? (
              <Copy className="h-3 w-3" />
            ) : (
              <Square className="h-2.5 w-2.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void api.close()}
            className="flex h-full w-10 items-center justify-center text-fl-text-dim transition-colors hover:bg-red-600 hover:text-white"
            title="閉じる"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
