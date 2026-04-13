import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

/**
 * Minimal frameless titlebar: brand on the left, window controls on the right.
 * Everything else (tabs, file ops, actions) lives in dedicated rows below.
 */
export function Titlebar() {
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

  return (
    <div
      className="flex h-7 flex-shrink-0 items-center bg-fl-panel"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 pl-3">
        <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-fl-text-muted">
          FLOWLINE
        </span>
      </div>

      {/* Draggable spacer */}
      <div className="flex-1" />

      {/* Window controls */}
      {api && (
        <div
          className="flex h-full"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() => void api.minimize()}
            className="flex h-full w-10 items-center justify-center text-fl-text-ghost transition-colors hover:bg-fl-panel-2 hover:text-fl-text"
            title="最小化"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => void api.toggleMaximize()}
            className="flex h-full w-10 items-center justify-center text-fl-text-ghost transition-colors hover:bg-fl-panel-2 hover:text-fl-text"
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
            className="flex h-full w-10 items-center justify-center text-fl-text-ghost transition-colors hover:bg-red-600 hover:text-white"
            title="閉じる"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
