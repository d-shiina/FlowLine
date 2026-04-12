import { app, type WebContents } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { detectPython } from './pythonRuntime';

/**
 * FLOWLINE Python worker manager. Spawns and keeps alive a single
 * Python subprocess running ``_runtime/worker.py`` under the isolated
 * ``_runtime/python/`` interpreter.
 *
 * Lifecycle:
 *
 * 1. Renderer calls ``runtime:run-node`` with a request.
 * 2. Main process lazy-spawns the worker on the first request so the
 *    Python cold-start import cost isn't paid until the user hits Run.
 * 3. We wait for the worker's ``ready`` frame, cache the node manifest,
 *    then dispatch the request.
 * 4. Log / result frames route back to renderers via
 *    ``runtime:node-log`` / ``runtime:node-result``.
 * 5. Worker stays idle between runs; a 5-minute idle timer reclaims it
 *    so long-lived sessions don't hog memory.
 * 6. ``before-quit`` in ``main.ts`` calls ``shutdownWorker()`` so the
 *    subprocess exits cleanly.
 *
 * Multi-track parallelism (one worker per track) is intentionally not
 * implemented yet — the single worker serialises all ``run_node``
 * requests, which matches how the engine dispatches today.
 */

// ── Frame types ────────────────────────────────────────────────────

export interface RunNodeRequest {
  reqId: string;
  blockId: string;
  trackId: string;
  nodeId: string;
  params: Record<string, unknown>;
  ports: Record<string, unknown>;
  timeout?: number;
}

export interface NodeLogFrame {
  type: 'log';
  reqId: string;
  blockId: string;
  trackId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface NodeResultFrame {
  type: 'result';
  reqId: string;
  blockId: string;
  trackId: string;
  ok: boolean;
  missing: boolean;
  outputs: Record<string, unknown>;
  error: { message: string; traceback: string | null } | null;
}

export interface NodeManifestEntry {
  id: string;
  label: string;
  labels: Record<string, string>;
  category: string;
  version: string;
  ports: Record<string, { kind: 'in' | 'out'; type?: string; required?: boolean }>;
  params: Record<string, unknown>;
  onError: string;
}

export interface NodeLoadError {
  path: string;
  module: string;
  message: string;
  traceback: string;
}

type InboundFrame =
  | {
      type: 'ready';
      nodes: NodeManifestEntry[];
      loadErrors?: NodeLoadError[];
      reloaded?: boolean;
    }
  | NodeLogFrame
  | NodeResultFrame
  | { type: 'fatal'; message: string };

// ── Constants ──────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// ── State ──────────────────────────────────────────────────────────

let child: ChildProcessWithoutNullStreams | null = null;
let readyPromise: Promise<NodeManifestEntry[]> | null = null;
let manifest: NodeManifestEntry[] = [];
let loadErrors: NodeLoadError[] = [];
let idleTimer: NodeJS.Timeout | null = null;

/**
 * Pending resolver for an in-flight reload. Only one reload runs
 * at a time — parallel callers await the same promise so the UI
 * doesn't queue multiple reload frames into the worker.
 */
let reloadPending:
  | {
      resolve: (result: {
        manifest: NodeManifestEntry[];
        loadErrors: NodeLoadError[];
      }) => void;
      reject: (err: Error) => void;
    }
  | null = null;

/**
 * In-flight requests keyed by reqId. Each entry stores the renderer
 * that made the request (for routing ``log``/``result`` frames) plus
 * the pending resolver for the result promise.
 */
interface Pending {
  sender: WebContents | null;
  resolve: (frame: NodeResultFrame) => void;
  reject: (err: Error) => void;
}
const pending = new Map<string, Pending>();

// ── Spawn + lifecycle ──────────────────────────────────────────────

function resolveWorkerPath(): string {
  // In dev this resolves to the in-repo ``_runtime/worker.py``.
  // In packaged builds the app is unpacked into Resources — we keep
  // the same _runtime layout, so ``app.getAppPath()`` still works.
  return path.join(app.getAppPath(), '_runtime', 'worker.py');
}

async function spawnWorker(): Promise<NodeManifestEntry[]> {
  const status = await detectPython();
  if (!status.pythonPath) {
    throw new Error(
      'python runtime not installed — open Python setup from the toolbar',
    );
  }
  const workerPath = resolveWorkerPath();

  // ``-u`` forces unbuffered stdio so logs arrive immediately. Without
  // it Python line-buffers stdout and the UI sees chunks of 4-8KB
  // instead of per-line updates.
  const proc = spawn(status.pythonPath, ['-u', workerPath], {
    cwd: app.getAppPath(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });

  child = proc;
  manifest = [];

  const rl = readline.createInterface({ input: proc.stdout });
  const ready = new Promise<NodeManifestEntry[]>((resolve, reject) => {
    let settled = false;
    const finish = (err: Error | null, entries?: NodeManifestEntry[]) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(entries ?? []);
    };

    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let frame: InboundFrame;
      try {
        frame = JSON.parse(trimmed) as InboundFrame;
      } catch (err) {
        console.warn('[pythonWorker] bad JSON from worker:', trimmed, err);
        return;
      }
      handleFrame(frame, finish);
    });

    proc.stderr.on('data', (buf: Buffer) => {
      const text = buf.toString();
      // Surface worker stderr in the main-process console — helps
      // when a node throws on import without us being able to route
      // a proper ``fatal`` frame.
      process.stderr.write(`[worker stderr] ${text}`);
    });

    proc.on('exit', (code, signal) => {
      // If we're still waiting for ``ready`` this is a fatal start-up
      // failure; surface it as a rejection.
      finish(
        new Error(
          `python worker exited before ready (code=${code}, signal=${signal})`,
        ),
      );
      // Reject any in-flight requests so callers don't hang forever.
      for (const [, p] of pending) {
        p.reject(new Error('python worker exited mid-run'));
      }
      pending.clear();
      child = null;
      readyPromise = null;
      manifest = [];
      clearIdleTimer();
    });
  });

  return ready;
}

function handleFrame(
  frame: InboundFrame,
  onReady: (err: Error | null, entries?: NodeManifestEntry[]) => void,
): void {
  if (frame.type === 'ready') {
    manifest = frame.nodes;
    loadErrors = frame.loadErrors ?? [];
    if (frame.reloaded && reloadPending) {
      reloadPending.resolve({ manifest, loadErrors });
      reloadPending = null;
    } else {
      // Initial ready after spawn — settle the boot promise.
      onReady(null, frame.nodes);
    }
    return;
  }
  if (frame.type === 'fatal') {
    // Fatal during reload surfaces the error to the reload caller
    // too, not just the boot promise.
    if (reloadPending) {
      reloadPending.reject(new Error(frame.message));
      reloadPending = null;
    }
    onReady(new Error(frame.message));
    for (const [, p] of pending) {
      p.reject(new Error(frame.message));
    }
    pending.clear();
    return;
  }
  if (frame.type === 'log') {
    const entry = pending.get(frame.reqId);
    if (entry?.sender && !entry.sender.isDestroyed()) {
      entry.sender.send('runtime:node-log', frame);
    }
    return;
  }
  if (frame.type === 'result') {
    const entry = pending.get(frame.reqId);
    pending.delete(frame.reqId);
    if (entry) entry.resolve(frame);
    maybeArmIdleTimer();
    return;
  }
}

function writeToWorker(payload: Record<string, unknown>): void {
  if (!child || !child.stdin.writable) {
    throw new Error('python worker not running');
  }
  const line = JSON.stringify(payload) + '\n';
  child.stdin.write(line);
}

function clearIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function maybeArmIdleTimer(): void {
  clearIdleTimer();
  if (pending.size > 0) return;
  idleTimer = setTimeout(() => {
    // Nothing running for IDLE_TIMEOUT_MS — reclaim the worker so
    // long-lived sessions don't hold the interpreter in memory.
    shutdownWorker().catch(() => undefined);
  }, IDLE_TIMEOUT_MS);
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Ensure a worker is alive and its node manifest is loaded. Subsequent
 * calls while the worker is up return the cached manifest immediately.
 */
export async function ensureWorkerReady(): Promise<NodeManifestEntry[]> {
  if (child && manifest.length > 0) return manifest;
  if (!readyPromise) {
    readyPromise = spawnWorker().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

/**
 * Dispatch a ``run_node`` request to the worker and await its result.
 * ``log`` frames arrive asynchronously on ``runtime:node-log``; the
 * result promise resolves once the terminal ``result`` frame arrives.
 */
export async function runNode(
  sender: WebContents | null,
  request: RunNodeRequest,
): Promise<NodeResultFrame> {
  await ensureWorkerReady();
  clearIdleTimer();
  return new Promise<NodeResultFrame>((resolve, reject) => {
    pending.set(request.reqId, { sender, resolve, reject });
    try {
      writeToWorker({
        type: 'run_node',
        reqId: request.reqId,
        blockId: request.blockId,
        trackId: request.trackId,
        nodeId: request.nodeId,
        params: request.params,
        ports: request.ports,
        timeout: request.timeout,
      });
    } catch (err) {
      pending.delete(request.reqId);
      reject(err as Error);
    }
  });
}

/**
 * Ask the worker to cancel the specified in-flight request. The
 * worker sets a cancel event; nodes that check ``ctx.cancelled``
 * unwind cooperatively. The final ``result`` frame still lands — we
 * don't remove the pending entry here.
 */
export function cancelNode(reqId: string): void {
  if (!child) return;
  try {
    writeToWorker({ type: 'cancel', reqId });
  } catch {
    /* worker gone */
  }
}

/**
 * Send a reset signal to the worker, clearing per-run state
 * (straggler executions, browser sessions, etc.).
 */
export function resetWorker(): void {
  if (!child) return;
  try {
    writeToWorker({ type: 'reset' });
  } catch {
    /* worker gone */
  }
}

/** Return the cached node manifest. Empty array if worker not up yet. */
export function getManifest(): NodeManifestEntry[] {
  return manifest;
}

/** Return the most recent load-error list reported by the worker. */
export function getLoadErrors(): NodeLoadError[] {
  return loadErrors;
}

/**
 * Ask the worker to rescan ``_runtime/nodes/`` and rebuild its
 * registry, then wait for the resulting ``ready`` frame. Used by
 * the node editor after saving a file so the new source takes
 * effect immediately without restarting the worker.
 *
 * If the worker isn't running yet, this spawns it — the first
 * spawn's manifest is equivalent to a "reload" anyway.
 */
export async function reloadWorker(): Promise<{
  manifest: NodeManifestEntry[];
  loadErrors: NodeLoadError[];
}> {
  if (!child) {
    const m = await ensureWorkerReady();
    return { manifest: m, loadErrors };
  }
  clearIdleTimer();
  if (reloadPending) {
    // Someone else already asked; piggy-back on their promise.
    return new Promise((resolve, reject) => {
      const existing = reloadPending;
      if (!existing) {
        // Race: cleared between the check and here.
        reloadWorker().then(resolve, reject);
        return;
      }
      const prevResolve = existing.resolve;
      const prevReject = existing.reject;
      existing.resolve = (result) => {
        prevResolve(result);
        resolve(result);
      };
      existing.reject = (err) => {
        prevReject(err);
        reject(err);
      };
    });
  }
  return new Promise((resolve, reject) => {
    reloadPending = { resolve, reject };
    try {
      writeToWorker({ type: 'reload' });
    } catch (err) {
      reloadPending = null;
      reject(err as Error);
    }
  });
}

/**
 * Shut down the worker cleanly. Sends ``shutdown``, waits briefly for
 * it to exit, then SIGKILLs if it refuses. Safe to call on app quit
 * even if no worker is running.
 */
export async function shutdownWorker(): Promise<void> {
  clearIdleTimer();
  const proc = child;
  if (!proc) return;
  try {
    writeToWorker({ type: 'shutdown' });
  } catch {
    /* stdin already closed */
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already dead */
      }
      resolve();
    }, 2000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  child = null;
  readyPromise = null;
  manifest = [];
}
