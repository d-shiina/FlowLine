import { useCallback, useEffect, useState } from 'react';

export interface RecentEntry {
  /** Display name (scenario.name at the time of opening). */
  name: string;
  /** Absolute file path if known (Electron main process). Empty for browser imports. */
  path?: string;
  /** Timestamp of last open, used for sorting. */
  openedAt: number;
  /** Rough track count, shown as a secondary subtitle. */
  trackCount?: number;
}

const STORAGE_KEY = 'flowline.recent';
const MAX_RECENT = 10;

/**
 * Tracks recently opened scenarios in localStorage.
 * Entries are keyed by path (if available) or by name + openedAt.
 */
export function useRecentScenarios() {
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RecentEntry[];
        if (Array.isArray(parsed)) setRecent(parsed);
      }
    } catch {
      // corrupt storage — ignore
    }
  }, []);

  const persist = useCallback((next: RecentEntry[]) => {
    setRecent(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage full or unavailable — ignore
    }
  }, []);

  const add = useCallback(
    (entry: Omit<RecentEntry, 'openedAt'> & { openedAt?: number }) => {
      const fullEntry: RecentEntry = {
        ...entry,
        openedAt: entry.openedAt ?? Date.now(),
      };
      setRecent((prev) => {
        // Deduplicate by path (if available) or name.
        const key = fullEntry.path || fullEntry.name;
        const filtered = prev.filter(
          (e) => (e.path || e.name) !== key,
        );
        const next = [fullEntry, ...filtered].slice(0, MAX_RECENT);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [],
  );

  const remove = useCallback(
    (path: string) => {
      setRecent((prev) => {
        const next = prev.filter((e) => (e.path || e.name) !== path);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  return { recent, add, remove, clear };
}
