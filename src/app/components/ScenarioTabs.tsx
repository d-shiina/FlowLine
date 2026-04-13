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
 * Horizontal tab strip for switching between open scenarios.
 * Rendered in the titlebar area between file actions and window controls.
 */
export function ScenarioTabs({
  tabs,
  activeId,
  onSwitch,
  onClose,
  onNewTab,
}: Props) {
  return (
    <div
      className="flex h-full min-w-0 flex-1 items-end gap-0.5 overflow-x-auto px-2"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className="group flex h-7 min-w-0 max-w-[180px] flex-shrink-0 items-center gap-1 rounded-t-md border-t border-l border-r px-2 font-mono text-[10px] transition-colors"
            style={{
              background: active ? 'var(--fl-bg)' : 'var(--fl-panel-2)',
              borderColor: active ? 'var(--fl-border)' : 'transparent',
              color: active ? 'var(--fl-text)' : 'var(--fl-text-faint)',
              borderBottom: active ? '1px solid var(--fl-bg)' : 'none',
              marginBottom: active ? -1 : 0,
            }}
          >
            <button
              type="button"
              onClick={() => onSwitch(tab.id)}
              className="min-w-0 flex-1 truncate text-left"
              title={tab.title}
            >
              {tab.title || '(無題)'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded text-fl-text-ghost opacity-0 transition-opacity hover:bg-fl-border hover:text-fl-text group-hover:opacity-100"
              title="タブを閉じる"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onNewTab}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-fl-text-ghost transition-colors hover:bg-fl-panel-2 hover:text-fl-text"
        title="新規シナリオ"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
