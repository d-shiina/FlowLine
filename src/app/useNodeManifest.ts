import { useCallback, useEffect, useState } from 'react';
import type { NodeManifestEntry } from '../globals';

export interface UseNodeManifest {
  manifest: NodeManifestEntry[];
  /** True while the initial fetch / spawn is in flight. */
  loading: boolean;
  /** Populated when the worker refuses to start. Never thrown — always logged. */
  error: string | null;
  /** Re-fetch the manifest (and optionally re-spawn a crashed worker). */
  refresh: () => Promise<void>;
}

/**
 * React hook that exposes the FLOWLINE Python worker's node manifest
 * to the renderer. Consumers use it to drive:
 *
 * - AddBlockModal's node picker (which nodeIds are available)
 * - Inspector's ports panel (what ports each node declares, their
 *   directions and types)
 * - Inspector's params panel (schema + defaults per node)
 *
 * Lifecycle:
 *
 * 1. On mount, check the Python runtime status. If it's missing,
 *    skip the spawn attempt — MockRuntime will be used at run time
 *    and there are no real nodes to list. The manifest stays empty.
 * 2. If Python is installed, call `ensureWorker()` to boot the
 *    worker and receive the manifest. This also warms up imports so
 *    the first Run isn't a cold start.
 * 3. Cache the result in state. `refresh()` re-runs the spawn path
 *    when called explicitly (e.g. after a plugin install, Phase 4).
 *
 * The hook is deliberately non-throwing: start-up failures surface
 * as `error` and leave `manifest` empty so the UI keeps rendering.
 * AddBlockModal falls back to the hand-curated ACTION_LABELS list
 * when `manifest` is empty, which keeps the editor usable on a
 * Python-free dev machine.
 */
export function useNodeManifest(): UseNodeManifest {
  const [manifest, setManifest] = useState<NodeManifestEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const api = window.flowlineRuntime;
    if (!api) {
      setManifest([]);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const status = await api.status();
      if (!status.pythonPath) {
        // Python not installed — no manifest, but not an error.
        setManifest([]);
        setError(null);
        return;
      }
      const res = await api.ensureWorker();
      if (res.ok) {
        setManifest(res.manifest);
        setError(null);
      } else {
        setManifest([]);
        setError(res.error);
      }
    } catch (err) {
      setManifest([]);
      setError((err as Error).message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Kick off the initial fetch on mount. Fire-and-forget — React
  // ignores the returned promise but errors are captured in state.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { manifest, loading, error, refresh };
}
