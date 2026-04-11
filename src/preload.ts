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
});
