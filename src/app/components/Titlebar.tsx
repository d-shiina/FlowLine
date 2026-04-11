import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

/**
 * Custom titlebar for the frameless Electron window.
 *
 * - Renders a 10px-tall draggable strip at the very top of the window
 *   via the `-webkit-app-region: drag` CSS hint.
 * - On the right, hosts minimize / maximize-or-restore / close buttons
 *   that call into the flowlineWindow preload bridge.
 * - The buttons have `-webkit-app-region: no-drag` so clicking them
 *   doesn't start a window drag.
 *
 * When `flowlineWindow` isn't available (e.g. running in a plain
 * browser for Vite preview), the component renders nothing — the user
 * keeps their browser chrome.
 */
export function Titlebar() {
  const api = typeof window !== 'undefined' ? window.flowlineWindow : undefined;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api) return;
    api
      .isMaximized()
      .then((v) => setMaximized(v))
      .catch(() => {
        /* ignore */
      });
    const unsub = api.onMaximizedChange(setMaximized);
    return () => unsub();
  }, [api]);

  if (!api) return null;

  const btn =
    'flex h-7 w-10 items-center justify-center text-fl-text-dim transition-colors hover:bg-fl-panel-2 hover:text-fl-text';

  return (
    <div
      className="flex h-7 flex-shrink-0 items-center justify-between border-b border-fl-border bg-fl-panel"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex-1" />
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => void api.minimize()}
          className={btn}
          title="最小化"
          aria-label="最小化"
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => void api.toggleMaximize()}
          className={btn}
          title={maximized ? '元のサイズに戻す' : '最大化'}
          aria-label={maximized ? '元のサイズに戻す' : '最大化'}
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
          className="flex h-7 w-10 items-center justify-center text-fl-text-dim transition-colors hover:bg-red-600 hover:text-white"
          title="閉じる"
          aria-label="閉じる"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
