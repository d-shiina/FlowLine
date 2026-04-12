import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { detectPython, installPython } from './main/pythonRuntime';
import {
  cancelNode,
  ensureWorkerReady,
  getLoadErrors,
  getManifest,
  reloadWorker,
  runNode,
  shutdownWorker,
  type RunNodeRequest,
} from './main/pythonWorker';
import {
  deleteNodeSource,
  listNodeFiles,
  readNodeSource,
  writeNodeSource,
} from './main/nodeFiles';
import { packScenario, unpackScenario } from './main/scenarioFile';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = (): BrowserWindow => {
  // Frameless window — FLOWLINE ships its own titlebar in the Toolbar.
  // `titleBarStyle: 'hidden'` on macOS keeps the traffic lights visible;
  // on Windows/Linux we drop the native frame entirely.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Broadcast maximize/unmaximize state so the custom titlebar can swap
  // its button icon. The renderer listens via window.flowlineWindow.
  const emitMaximized = () => {
    mainWindow.webContents.send(
      'window:maximized-changed',
      mainWindow.isMaximized(),
    );
  };
  mainWindow.on('maximize', emitMaximized);
  mainWindow.on('unmaximize', emitMaximized);

  return mainWindow;
};

// Window control IPC — invoked from the custom titlebar in the renderer.
ipcMain.handle('window:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize();
});
ipcMain.handle('window:toggle-maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
  return win.isMaximized();
});
ipcMain.handle('window:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});
ipcMain.handle('window:is-maximized', (e) => {
  return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
});

// ── Python runtime IPC ─────────────────────────────────────────────
// The renderer surfaces an install banner / modal when the isolated
// Python interpreter isn't present in ``_runtime/python/``. On install
// the main process downloads a pinned python-build-standalone bundle
// and streams progress back through ``runtime:install-progress`` so
// the UI can render a live progress bar without polling.
ipcMain.handle('runtime:status', async () => {
  return detectPython();
});
ipcMain.handle('runtime:install', async (e) => {
  try {
    await installPython(e.sender);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? String(err) };
  }
});

// ── Python worker IPC ──────────────────────────────────────────────
// The renderer's `IpcRuntime` dispatches `run_node` requests through
// here. ``runtime:run-node`` is synchronous (on the renderer side):
// it resolves with the terminal ``result`` frame. Live ``log`` frames
// stream via ``runtime:node-log``, not the invoke return channel.
ipcMain.handle(
  'runtime:run-node',
  async (e, request: RunNodeRequest) => {
    try {
      const result = await runNode(e.sender, request);
      return { ok: true, result };
    } catch (err) {
      return {
        ok: false,
        error: (err as Error).message ?? String(err),
      };
    }
  },
);

ipcMain.handle('runtime:cancel-node', async (_e, reqId: string) => {
  cancelNode(reqId);
});

ipcMain.handle('runtime:ensure-worker', async () => {
  try {
    const manifest = await ensureWorkerReady();
    return { ok: true, manifest };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? String(err) };
  }
});

ipcMain.handle('runtime:node-manifest', async () => getManifest());

ipcMain.handle('runtime:node-load-errors', async () => getLoadErrors());

// ── Node editor IPC ────────────────────────────────────────────────
// The in-app Python node editor reads / writes files under
// `_runtime/nodes/` through these handlers. The main process is
// the only place that touches the filesystem — the renderer
// never gets a raw path — and nodeFiles.ts rejects path traversal
// so a malicious file path can't escape the sandbox.
ipcMain.handle('runtime:list-nodes', async () => {
  try {
    const files = await listNodeFiles();
    return { ok: true, files };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? String(err) };
  }
});

ipcMain.handle(
  'runtime:read-node',
  async (_e, relPath: string) => {
    try {
      const source = await readNodeSource(relPath);
      return { ok: true, source };
    } catch (err) {
      return { ok: false, error: (err as Error).message ?? String(err) };
    }
  },
);

ipcMain.handle(
  'runtime:write-node',
  async (_e, args: { path: string; source: string }) => {
    try {
      await writeNodeSource(args.path, args.source);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message ?? String(err) };
    }
  },
);

ipcMain.handle(
  'runtime:delete-node',
  async (_e, relPath: string) => {
    try {
      await deleteNodeSource(relPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message ?? String(err) };
    }
  },
);

ipcMain.handle('runtime:reload-nodes', async () => {
  try {
    const result = await reloadWorker();
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? String(err) };
  }
});

// ── .fls scenario file handlers ─────────────────────────────
ipcMain.handle(
  'scenario:export',
  async (e, scenarioJson: string, nodeIds: string[], manifest: unknown[]) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return { ok: false, error: 'no window' };
    try {
      return await packScenario(
        win,
        scenarioJson,
        nodeIds,
        manifest as Array<{ id: string; [key: string]: unknown }>,
      );
    } catch (err) {
      return { ok: false, error: (err as Error).message ?? String(err) };
    }
  },
);

ipcMain.handle('scenario:import', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return { ok: false, error: 'no window' };
  try {
    return await unpackScenario(win);
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? String(err),
      installedNodes: [],
      updatedNodes: [],
      skippedNodes: [],
    };
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Make sure the Python worker stops along with the app. ``before-quit``
// fires before windows are torn down so we have a chance to send the
// ``shutdown`` frame cleanly. Guarded so we don't loop on the second
// quit triggered by ``app.exit``.
let shuttingDown = false;
app.on('before-quit', (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  shutdownWorker().finally(() => app.exit(0));
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
