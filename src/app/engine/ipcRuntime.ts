import type {
  NodeLogFrame,
  NodeManifestEntry,
  NodeResultFrame,
  RunNodeRequest,
} from '../../globals';
import { MockRuntime } from './runtime';
import type { NodeCall, NodeContext, Runtime, RuntimeResult } from './runtime';

/**
 * Runtime that dispatches blocks to the FLOWLINE Python worker over
 * the main-process IPC bridge exposed by ``preload.ts``.
 *
 * Responsibilities:
 *
 * 1. Cache the node manifest so we know each port's direction at
 *    binding-resolution time.
 * 2. Translate a ``Block`` into a ``run_node`` request: resolve
 *    in-port bindings from the executor's variable store, attach
 *    params / timeout, generate a unique ``reqId``.
 * 3. Route ``log`` frames from the worker into ``NodeContext.log``
 *    so they land in the ExecutionLogPanel exactly like mock logs.
 * 4. Reflect out-port values back into the variable store via
 *    ``NodeContext.setVariable``.
 * 5. Translate the worker's result envelope into the engine's
 *    ``RuntimeResult`` shape (``ok / missing / errorMessage``).
 *
 * Instantiation should happen once per execution — the `start()`
 * method in `useExecution` creates a fresh runtime for each Run so
 * the log subscription lifecycle aligns with the run.
 */
export class IpcRuntime implements Runtime {
  private manifestByNodeId: Map<string, NodeManifestEntry> = new Map();
  /**
   * Active in-flight request routing. The key is the reqId we sent
   * with ``run_node``; the value is the ``NodeContext`` whose ``log``
   * callback forwards the worker's log frames. We register a single
   * ``onNodeLog`` subscription on construction and multiplex over
   * this map.
   */
  private logRoutes: Map<string, NodeContext> = new Map();
  private unsubscribeLog: (() => void) | null = null;
  private reqCounter = 0;
  private disposed = false;
  /**
   * Fallback runtime for blocks that have no ``nodeId`` assigned.
   * Legacy scenarios (and any block the user hasn't bound to a
   * Python node yet) flow through this so they keep animating with
   * mock latency instead of being silently no-op'd. Label-based
   * mock behaviour (FAIL / MISSING triggers) still works in this
   * mixed mode.
   */
  private mockFallback = new MockRuntime();

  /**
   * Ensure the worker is running, prime the manifest, and install a
   * single log subscription. Throws if the worker can't start so the
   * caller can fall back to MockRuntime.
   */
  static async create(): Promise<IpcRuntime> {
    const api = window.flowlineRuntime;
    if (!api) {
      throw new Error('flowlineRuntime preload bridge not available');
    }
    const ensure = await api.ensureWorker();
    if (!ensure.ok) {
      throw new Error(ensure.error);
    }
    // Reset worker state (close leftover browser sessions, etc.).
    await api.resetWorker();
    const runtime = new IpcRuntime();
    for (const entry of ensure.manifest) {
      runtime.manifestByNodeId.set(entry.id, entry);
    }
    runtime.unsubscribeLog = api.onNodeLog((frame) => runtime.routeLog(frame));
    return runtime;
  }

  /** True once the worker manifest has at least one entry. */
  hasNodes(): boolean {
    return this.manifestByNodeId.size > 0;
  }

  /**
   * Tear down the log subscription. Idempotent. Call on execution
   * end so stale frames (from a worker that's still running when
   * the user starts a new scenario) don't fire into a dead context.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.unsubscribeLog) {
      this.unsubscribeLog();
      this.unsubscribeLog = null;
    }
    this.logRoutes.clear();
  }

  async run(node: NodeCall, ctx: NodeContext): Promise<RuntimeResult> {
    const api = window.flowlineRuntime;
    if (!api) {
      return { ok: false, errorMessage: 'flowlineRuntime not available' };
    }
    const nodeId = node.nodeId;
    if (!nodeId) {
      // Step has no nodeId — delegate to the mock fallback.
      return this.mockFallback.run(node, ctx);
    }
    const manifest = this.manifestByNodeId.get(nodeId);
    if (!manifest) {
      ctx.log(
        'warn',
        `ノード id "${nodeId}" がワーカーの manifest に存在しません → Mock で実行`,
      );
      return this.mockFallback.run(node, ctx);
    }

    // Resolve in-port bindings.
    const ports: Record<string, unknown> = {};
    const bindings = node.bindings ?? {};
    for (const [portName, def] of Object.entries(manifest.ports)) {
      if (def.kind !== 'in') continue;
      const binding = bindings[portName];
      if (!binding) continue;
      if (binding.kind === 'var') {
        const value = ctx.getVariable(binding.key);
        if (value !== undefined) ports[portName] = value;
      } else {
        ports[portName] = binding.value;
      }
    }

    const reqId = `r-${++this.reqCounter}-${Date.now()}`;
    this.logRoutes.set(reqId, ctx);

    const request: RunNodeRequest = {
      reqId,
      blockId: node.id,
      trackId: ctx.trackId,
      nodeId,
      params: node.params ?? {},
      ports,
      timeout: node.timeout,
    };

    try {
      const response = await api.runNode(request);
      if (!response.ok) {
        return { ok: false, errorMessage: response.error };
      }
      return this.applyResult(node, ctx, response.result, manifest);
    } catch (err) {
      return { ok: false, errorMessage: (err as Error).message ?? String(err) };
    } finally {
      this.logRoutes.delete(reqId);
    }
  }

  /**
   * Translate a terminal ``result`` frame into ``RuntimeResult`` and
   * write any out-port values back into the variable store through
   * the step's bindings.
   */
  private applyResult(
    node: NodeCall,
    ctx: NodeContext,
    frame: NodeResultFrame,
    manifest: NodeManifestEntry,
  ): RuntimeResult {
    if (frame.ok) {
      const bindings = node.bindings ?? {};
      for (const [portName, def] of Object.entries(manifest.ports)) {
        if (def.kind !== 'out') continue;
        const binding = bindings[portName];
        if (!binding || binding.kind !== 'var') continue;
        if (Object.prototype.hasOwnProperty.call(frame.outputs, portName)) {
          ctx.setVariable(binding.key, frame.outputs[portName]);
        }
      }
      return { ok: true };
    }
    return {
      ok: false,
      missing: frame.missing,
      errorMessage: frame.error?.message ?? 'unknown worker error',
    };
  }

  /** Dispatch an incoming log frame to the ctx that made the request. */
  private routeLog(frame: NodeLogFrame): void {
    const ctx = this.logRoutes.get(frame.reqId);
    if (!ctx) return;
    ctx.log(frame.level, frame.message);
  }
}
