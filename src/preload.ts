import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload bridge for FLOWLINE. Exposes a minimal API for the custom
 * titlebar (frameless window) to talk to the main process without
 * unlocking node integration in the renderer.
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
