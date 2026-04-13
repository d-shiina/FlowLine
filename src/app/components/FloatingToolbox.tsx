import { Box, Hexagon, Redo2, Undo2 } from 'lucide-react';

export type EditMode = 'block' | 'sync';

interface Props {
  mode: EditMode;
  onModeChange: (m: EditMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Floating edit toolbox overlaid on the timeline canvas. Holds the
 * operational controls (undo / redo / block-add / link / sync mode)
 * that used to live in the top Toolbar, so the scenario name and the
 * run button up top stay uncluttered.
 *
 * Vertical column pinned to the top-right of the chart area, mirroring
 * the "tools palette" pattern from drawing and CAD apps. The parent
 * must be `position: relative` with enough room — App wraps the scroll
 * viewport for exactly this purpose.
 */
export function FloatingToolbox({
  mode,
  onModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  const modes: Array<{
    key: EditMode;
    label: string;
    hint: string;
    color: string;
    icon: typeof Box;
  }> = [
    {
      key: 'block',
      label: 'ブロック追加',
      hint: 'キャンバスをクリックしてブロック配置',
      color: '#3b82f6',
      icon: Box,
    },
    {
      key: 'sync',
      label: '同期ポイント',
      hint: 'キャンバスをクリックして同期ポイント配置',
      color: '#f43f5e',
      icon: Hexagon,
    },
  ];

  return (
    <div
      className="pointer-events-none absolute top-3 right-3 z-20 flex flex-col gap-2"
      aria-label="編集ツール"
    >
      {/* Undo / Redo group */}
      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-fl-border-strong bg-fl-panel/92 shadow-lg backdrop-blur">
        <ToolboxIconButton
          icon={Undo2}
          label="元に戻す"
          shortcut="Ctrl+Z"
          onClick={onUndo}
          disabled={!canUndo}
        />
        <div className="h-px bg-fl-border" />
        <ToolboxIconButton
          icon={Redo2}
          label="やり直し"
          shortcut="Ctrl+Shift+Z"
          onClick={onRedo}
          disabled={!canRedo}
        />
      </div>

      {/* Edit-mode group */}
      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-fl-border-strong bg-fl-panel/92 shadow-lg backdrop-blur">
        {modes.map((m, i) => (
          <div key={m.key} className="flex flex-col">
            {i > 0 && <div className="h-px bg-fl-border" />}
            <ToolboxIconButton
              icon={m.icon}
              label={m.label}
              shortcut={m.hint}
              onClick={() => onModeChange(m.key)}
              active={mode === m.key}
              activeColor={m.color}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface IconButtonProps {
  icon: typeof Box;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  activeColor?: string;
}

function ToolboxIconButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled = false,
  active = false,
  activeColor,
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} · ${shortcut}` : label}
      aria-label={label}
      aria-pressed={active}
      className="flex h-9 w-9 items-center justify-center text-fl-text-faint transition-colors hover:bg-fl-panel-2 hover:text-fl-text disabled:cursor-not-allowed disabled:text-fl-text-ghost disabled:hover:bg-transparent disabled:hover:text-fl-text-ghost"
      style={
        active && activeColor
          ? { background: `${activeColor}22`, color: activeColor }
          : undefined
      }
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
