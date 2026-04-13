import { useCallback, useEffect, useRef, useState } from 'react';
import type { Scenario } from './types';
import { ERROR_HANDLER_COLOR, ERROR_HANDLER_ID, TRACK_COLORS } from './types';

/**
 * Per-tab metadata. Scenario tabs hold a full scenario snapshot; the
 * welcome tab is a special placeholder with no scenario.
 */
export interface ScenarioTab {
  id: string;
  kind: 'scenario' | 'welcome';
  title: string;
  /** Full scenario snapshot. Undefined for welcome tab. */
  snapshot?: Scenario;
}

export interface UseScenarioTabs {
  tabs: ScenarioTab[];
  activeId: string;
  activeTab: ScenarioTab | undefined;
  switchTab: (targetId: string, currentScenario: Scenario) => Scenario | null;
  openTab: (scenario?: Scenario, title?: string) => Scenario;
  openWelcome: () => void;
  closeTab: (targetId: string, currentScenario: Scenario) => Scenario | null;
  renameActive: (title: string) => void;
  syncActive: (scenario: Scenario) => void;
}

const WELCOME_TAB_ID = '__welcome__';

function makeTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function emptyScenario(name = '新規シナリオ'): Scenario {
  const tid = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    version: '1.0',
    name,
    variables: { scenario: {} },
    tracks: [
      {
        id: tid,
        name: 'トラック1',
        color: TRACK_COLORS[0],
        blocks: [],
      },
    ],
    syncPoints: [],
    errorHandler: {
      id: ERROR_HANDLER_ID,
      name: 'エラー処理',
      color: ERROR_HANDLER_COLOR,
      blocks: [],
    },
    subroutines: [],
  };
}

function welcomeTab(): ScenarioTab {
  return {
    id: WELCOME_TAB_ID,
    kind: 'welcome',
    title: 'ようこそ',
  };
}

export function useScenarioTabs(): UseScenarioTabs {
  // Start with just the welcome tab.
  const [tabs, setTabs] = useState<ScenarioTab[]>(() => [welcomeTab()]);
  const [activeId, setActiveId] = useState<string>(WELCOME_TAB_ID);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const activeTab = tabs.find((t) => t.id === activeId);

  const switchTab = useCallback(
    (targetId: string, currentScenario: Scenario): Scenario | null => {
      if (targetId === activeIdRef.current) return null;
      const target = tabs.find((t) => t.id === targetId);
      if (!target) return null;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeIdRef.current && t.kind === 'scenario'
            ? {
                ...t,
                snapshot: currentScenario,
                title: currentScenario.name || t.title,
              }
            : t,
        ),
      );
      setActiveId(targetId);
      return target.snapshot ?? null;
    },
    [tabs],
  );

  const openTab = useCallback(
    (scenario?: Scenario, title?: string): Scenario => {
      const s = scenario ?? emptyScenario();
      const tab: ScenarioTab = {
        id: makeTabId(),
        kind: 'scenario',
        title: title ?? s.name ?? '新規シナリオ',
        snapshot: s,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveId(tab.id);
      return s;
    },
    [],
  );

  const openWelcome = useCallback(() => {
    setTabs((prev) => {
      const has = prev.some((t) => t.kind === 'welcome');
      if (has) return prev;
      return [welcomeTab(), ...prev];
    });
    setActiveId(WELCOME_TAB_ID);
  }, []);

  const closeTab = useCallback(
    (targetId: string, currentScenario: Scenario): Scenario | null => {
      let next: Scenario | null = null;
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === targetId);
        if (idx === -1) return prev;
        const wasActive = targetId === activeIdRef.current;

        const updated = prev.map((t) =>
          t.id === activeIdRef.current && !wasActive && t.kind === 'scenario'
            ? {
                ...t,
                snapshot: currentScenario,
                title: currentScenario.name || t.title,
              }
            : t,
        );

        const without = updated.filter((t) => t.id !== targetId);

        // If nothing is left, fall back to a welcome tab.
        if (without.length === 0) {
          const w = welcomeTab();
          setActiveId(w.id);
          next = null;
          return [w];
        }

        if (wasActive) {
          const fallback = without[Math.max(0, idx - 1)] ?? without[0];
          setActiveId(fallback.id);
          next = fallback.snapshot ?? null;
        }
        return without;
      });
      return next;
    },
    [],
  );

  const renameActive = useCallback((title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeIdRef.current ? { ...t, title } : t)),
    );
  }, []);

  const syncActive = useCallback((scenario: Scenario) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeIdRef.current && t.kind === 'scenario'
          ? { ...t, snapshot: scenario, title: scenario.name || t.title }
          : t,
      ),
    );
  }, []);

  useEffect(() => {
    // no-op placeholder
  }, []);

  return {
    tabs,
    activeId,
    activeTab,
    switchTab,
    openTab,
    openWelcome,
    closeTab,
    renameActive,
    syncActive,
  };
}
