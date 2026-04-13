import { useCallback, useEffect, useRef, useState } from 'react';
import type { Scenario } from './types';
import { cloneSample, DEFAULT_SAMPLE } from './samples';

/**
 * Per-tab metadata. The actual active scenario lives in `useScenario`
 * (via store.replace on tab switch); inactive tabs keep a snapshot here.
 */
export interface ScenarioTab {
  id: string;
  /** Display label shown on the tab. */
  title: string;
  /** Full serialised scenario state. Updated on tab switch from the active store. */
  snapshot: Scenario;
}

export interface UseScenarioTabs {
  tabs: ScenarioTab[];
  activeId: string;
  /** Switch to a tab. Caller provides current active scenario so it can be saved. */
  switchTab: (targetId: string, currentScenario: Scenario) => Scenario | null;
  /** Open a new empty or preloaded scenario tab. Returns the new scenario to load. */
  openTab: (scenario?: Scenario, title?: string) => Scenario;
  /** Close a tab. If closing the active one, returns the scenario of the tab that should become active. */
  closeTab: (targetId: string, currentScenario: Scenario) => Scenario | null;
  /** Rename the active tab (e.g. when scenario.name changes). */
  renameActive: (title: string) => void;
  /** Update the active tab's snapshot (for dirty tracking / tab switch). */
  syncActive: (scenario: Scenario) => void;
}

function makeTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function emptyScenario(name = '新規シナリオ'): Scenario {
  const base = cloneSample(DEFAULT_SAMPLE);
  return { ...base, name };
}

/**
 * Manages a list of scenario tabs and the active one.
 * Each tab holds a full scenario snapshot; the active tab's scenario
 * lives in the main `useScenario` store and is synced back here on
 * tab switch / close.
 */
export function useScenarioTabs(
  initialScenario: Scenario,
): UseScenarioTabs {
  const initialTab: ScenarioTab = {
    id: makeTabId(),
    title: initialScenario.name || '空のシナリオ',
    snapshot: initialScenario,
  };
  const [tabs, setTabs] = useState<ScenarioTab[]>([initialTab]);
  const [activeId, setActiveId] = useState<string>(initialTab.id);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const switchTab = useCallback(
    (targetId: string, currentScenario: Scenario): Scenario | null => {
      if (targetId === activeIdRef.current) return null;
      const target = tabs.find((t) => t.id === targetId);
      if (!target) return null;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeIdRef.current
            ? { ...t, snapshot: currentScenario, title: currentScenario.name || t.title }
            : t,
        ),
      );
      setActiveId(targetId);
      return target.snapshot;
    },
    [tabs],
  );

  const openTab = useCallback(
    (scenario?: Scenario, title?: string): Scenario => {
      const s = scenario ?? emptyScenario();
      const tab: ScenarioTab = {
        id: makeTabId(),
        title: title ?? s.name ?? '新規シナリオ',
        snapshot: s,
      };
      setTabs((prev) => {
        // Save current active tab's snapshot before switching
        return [...prev, tab];
      });
      setActiveId(tab.id);
      return s;
    },
    [],
  );

  const closeTab = useCallback(
    (targetId: string, currentScenario: Scenario): Scenario | null => {
      let next: Scenario | null = null;
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === targetId);
        if (idx === -1) return prev;
        // Don't close the last tab — reset it to a blank one instead.
        if (prev.length === 1) {
          const blank = emptyScenario();
          next = blank;
          return [{ ...prev[0], snapshot: blank, title: blank.name }];
        }
        const wasActive = targetId === activeIdRef.current;
        const updated = prev.map((t) =>
          t.id === activeIdRef.current && !wasActive
            ? { ...t, snapshot: currentScenario, title: currentScenario.name || t.title }
            : t,
        );
        const without = updated.filter((t) => t.id !== targetId);
        if (wasActive) {
          const fallback = without[Math.max(0, idx - 1)] ?? without[0];
          setActiveId(fallback.id);
          next = fallback.snapshot;
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
        t.id === activeIdRef.current
          ? { ...t, snapshot: scenario, title: scenario.name || t.title }
          : t,
      ),
    );
  }, []);

  // Keep the active tab's title in sync with its scenario name.
  useEffect(() => {
    // no-op — syncActive is called explicitly by the caller.
  }, []);

  return {
    tabs,
    activeId,
    switchTab,
    openTab,
    closeTab,
    renameActive,
    syncActive,
  };
}
