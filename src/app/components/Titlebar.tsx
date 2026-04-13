import { useEffect, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import {
  Minus,
  Square,
  Copy,
  X,
  ChevronDown,
} from 'lucide-react';

interface Props {
  onImport: () => void;
  onExport: () => void;
  onSample: () => void;
  onToggleTheme: () => void;
  theme: 'light' | 'dark';
}

/**
 * VSCode-style titlebar:
 * - Brand + inline menus on the left (ファイル / 表示)
 * - Draggable spacer in the middle
 * - Window controls on the right
 *
 * No separate toolbar row below — file actions live in the File menu,
 * run button lives in the tab bar.
 */
export function Titlebar({
  onImport,
  onExport,
  onSample,
  onToggleTheme,
  theme,
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

  return (
    <div
      className="flex h-7 flex-shrink-0 items-center bg-fl-panel"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Brand + menus */}
      <div
        className="flex h-full items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className="px-3 font-mono text-[10px] font-bold tracking-[0.2em] text-fl-text-muted">
          FLOWLINE
        </span>

        <MenuButton label="ファイル">
          <MenuItem onSelect={onImport} shortcut="Ctrl+O">
            開く…
          </MenuItem>
          <MenuItem onSelect={onExport} shortcut="Ctrl+S">
            保存…
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={onSample}>サンプルを読込</MenuItem>
        </MenuButton>

        <MenuButton label="表示">
          <MenuItem onSelect={onToggleTheme}>
            {theme === 'dark' ? 'ライトテーマ' : 'ダークテーマ'}
          </MenuItem>
        </MenuButton>
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

// ── Menu helpers ────────────────────────────

function MenuButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger className="flex h-7 items-center gap-0.5 px-3 font-mono text-[10px] text-fl-text-faint outline-none transition-colors hover:bg-fl-panel-2 hover:text-fl-text data-[popup-open]:bg-fl-panel-2 data-[popup-open]:text-fl-text">
        {label}
        <ChevronDown className="h-2.5 w-2.5 opacity-50" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={2} align="start" className="z-[250] outline-none">
          <Menu.Popup className="min-w-[180px] rounded-md border border-fl-border-strong bg-fl-modal py-1 shadow-xl outline-none">
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function MenuItem({
  children,
  shortcut,
  onSelect,
}: {
  children: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <Menu.Item
      onClick={onSelect}
      className="flex cursor-pointer items-center justify-between gap-4 px-3 py-1.5 font-mono text-[10px] text-fl-text-muted outline-none transition-colors data-[highlighted]:bg-[#3b82f620] data-[highlighted]:text-fl-text"
    >
      <span>{children}</span>
      {shortcut && (
        <span className="font-mono text-[8px] text-fl-text-ghost">
          {shortcut}
        </span>
      )}
    </Menu.Item>
  );
}

function MenuSeparator() {
  return <div className="my-1 h-px bg-fl-border" />;
}
