import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload bridge for FLOWLINE. Exposes minimal APIs for:
 *  - the custom titlebar (frameless window controls)
 *  - the isolated Python runtime (status + install)
 *
 * Everything the renderer can call is explicitly listed here; we
 * don't hand out ``ipcRenderer`` directly so contextIsolation stays
 * meaningful.
 */
contextBridge.exposeInMainWorld('flowlineWindow', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: (): Promise<boolean> =>
    ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    const handler = (_: unknown, max: boolean) => cb(max);
    ipcRenderer.on('window:maximized-changed', handler);
    return () => ipcRenderer.off('window:maximized-changed', handler);
  },
});

contextBridge.exposeInMainWorld('flowlineRuntime', {
  /** Ask the main process if the isolated Python runtime is installed. */
  status: () => ipcRenderer.invoke('runtime:status'),
  /**
   * Kick off a pinned python-build-standalone install. Resolves with
   * ``{ ok: true }`` on success or ``{ ok: false, error }`` on
   * failure — errors also arrive as a final ``phase: 'error'``
   * progress event so the UI can render inline feedback.
   */
  install: () => ipcRenderer.invoke('runtime:install'),
  /**
   * Subscribe to install progress events. Returns an unsubscribe fn;
   * callers should cache it and call on unmount.
   */
  onInstallProgress: (
    cb: (progress: {
      phase: 'starting' | 'downloading' | 'extracting' | 'done' | 'error';
      progress: number;
      message: string;
    }) => void,
  ) => {
    const handler = (_: unknown, p: Parameters<typeof cb>[0]) => cb(p);
    ipcRenderer.on('runtime:install-progress', handler);
    return () => ipcRenderer.off('runtime:install-progress', handler);
  },
  /**
   * Boot the Python worker (if not already up) and return the node
   * manifest. Resolves with `{ ok: true, manifest }` on success or
   * `{ ok: false, error }` on startup failure.
   */
  ensureWorker: () => ipcRenderer.invoke('runtime:ensure-worker'),
  /** Fetch the cached node manifest without forcing a spawn. */
  manifest: () => ipcRenderer.invoke('runtime:node-manifest'),
  /**
   * Dispatch a single ``run_node`` request to the worker. Resolves
   * once the worker emits the terminal ``result`` frame. Transport
   * errors become ``{ ok: false, error }``; node-level failures show
   * up as ``{ ok: true, result: { ok: false, error: {...} } }``.
   */
  runNode: (request: {
    reqId: string;
    blockId: string;
    trackId: string;
    nodeId: string;
    params: Record<string, unknown>;
    ports: Record<string, unknown>;
    timeout?: number;
  }) => ipcRenderer.invoke('runtime:run-node', request),
  /**
   * Ask the worker to cooperatively cancel the in-flight request.
   * Safe to call after completion — it's a no-op in that case.
   */
  cancelNode: (reqId: string) =>
    ipcRenderer.invoke('runtime:cancel-node', reqId),
  /**
   * Subscribe to worker ``log`` frames. Main process routes each
   * frame only to the WebContents that made the matching run_node
   * request, so multi-window setups don't cross-talk.
   */
  onNodeLog: (
    cb: (frame: {
      reqId: string;
      blockId: string;
      trackId: string;
      level: 'info' | 'warn' | 'error';
      message: string;
    }) => void,
  ) => {
    const handler = (_: unknown, p: Parameters<typeof cb>[0]) => cb(p);
    ipcRenderer.on('runtime:node-log', handler);
    return () => ipcRenderer.off('runtime:node-log', handler);
  },
  // ── Node editor ────────────────────────────────────────────
  /** Enumerate node source files under ``_runtime/nodes/``. */
  listNodeFiles: () => ipcRenderer.invoke('runtime:list-nodes'),
  /** Read a node source file by forward-slash relative path. */
  readNodeSource: (relPath: string) =>
    ipcRenderer.invoke('runtime:read-node', relPath),
  /** Create or overwrite a node source file. */
  writeNodeSource: (relPath: string, source: string) =>
    ipcRenderer.invoke('runtime:write-node', { path: relPath, source }),
  /** Delete a node source file. Missing files succeed silently. */
  deleteNodeSource: (relPath: string) =>
    ipcRenderer.invoke('runtime:delete-node', relPath),
  /** Re-scan _runtime/nodes/ and rebuild the worker registry. */
  reloadNodes: () => ipcRenderer.invoke('runtime:reload-nodes'),
  /** Fetch the most recent load-error list reported by the worker. */
  loadErrors: () => ipcRenderer.invoke('runtime:node-load-errors'),
});

/**
 * .fls scenario file APIs. Uses native file dialogs so the renderer
 * never touches raw file paths.
 */
contextBridge.exposeInMainWorld('flowlineScenario', {
  /** Export scenario as .fls (ZIP) or legacy .json. Opens a save dialog. */
  exportFile: (
    scenarioJson: string,
    nodeIds: string[],
    manifest: unknown[],
  ) => ipcRenderer.invoke('scenario:export', scenarioJson, nodeIds, manifest),
  /** Import a .fls or .json file. Opens an open dialog. */
  importFile: () => ipcRenderer.invoke('scenario:import'),
});
