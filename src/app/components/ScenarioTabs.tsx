import { Tabs } from '@base-ui/react/tabs';
import { Plus, X } from 'lucide-react';
import type { ScenarioTab } from '../useScenarioTabs';

interface Props {
  tabs: ScenarioTab[];
  activeId: string;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
}

/**
 * Flat, underline-style scenario tabs using Base UI Tabs primitive.
 * The active tab shows an animated blue indicator underneath.
 */
export function ScenarioTabs({
  tabs,
  activeId,
  onSwitch,
  onClose,
  onNewTab,
}: Props) {
  return (
    <Tabs.Root
      value={activeId}
      onValueChange={(next) => onSwitch(String(next))}
      className="flex h-9 flex-shrink-0 items-end border-b border-fl-border bg-fl-panel"
    >
      <Tabs.List className="relative flex h-full min-w-0 flex-1 items-end overflow-x-auto">
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.id}
            value={tab.id}
            className="group relative flex h-full min-w-0 max-w-[200px] flex-shrink-0 cursor-pointer items-center gap-1.5 border-r border-fl-border px-4 font-mono text-[10px] text-fl-text-faint outline-none transition-colors hover:bg-fl-panel-2 data-[selected]:bg-fl-bg data-[selected]:text-fl-text"
          >
            <span
              className="truncate"
              title={tab.title}
            >
              {tab.title || '(無題)'}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-fl-text-ghost opacity-0 transition hover:bg-fl-border hover:text-fl-text group-hover:opacity-100"
              title="タブを閉じる"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Tabs.Tab>
        ))}

        {/* Animated underline for the active tab */}
        <Tabs.Indicator
          className="absolute bottom-0 left-[var(--active-tab-left)] h-[2px] w-[var(--active-tab-width)] bg-[#3b82f6] transition-all duration-200"
        />
      </Tabs.List>

      <button
        type="button"
        onClick={onNewTab}
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-fl-text-ghost transition-colors hover:bg-fl-panel-2 hover:text-fl-text"
        title="新規シナリオ"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </Tabs.Root>
  );
}
