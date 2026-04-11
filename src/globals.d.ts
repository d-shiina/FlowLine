/**
 * Globals injected by the Electron preload script.
 * See src/preload.ts for the implementation.
 */
export interface FlowlineWindowAPI {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<boolean>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  /** Subscribe to maximize state changes. Returns an unsubscribe fn. */
  onMaximizedChange(cb: (maximized: boolean) => void): () => void;
}

export interface PythonStatus {
  pythonPath: string | null;
  runtimeDir: string;
  installing: boolean;
  version: string;
}

export type InstallPhase =
  | 'starting'
  | 'downloading'
  | 'extracting'
  | 'done'
  | 'error';

export interface InstallProgressEvent {
  phase: InstallPhase;
  progress: number;
  message: string;
}

export interface NodePortDef {
  kind: 'in' | 'out';
  type?: string;
  required?: boolean;
}

export interface NodeManifestEntry {
  id: string;
  label: string;
  labels: Record<string, string>;
  category: string;
  version: string;
  ports: Record<string, NodePortDef>;
  params: Record<string, unknown>;
  onError: string;
}

export interface RunNodeRequest {
  reqId: string;
  blockId: string;
  trackId: string;
  nodeId: string;
  params: Record<string, unknown>;
  ports: Record<string, unknown>;
  timeout?: number;
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

export interface NodeLogFrame {
  reqId: string;
  blockId: string;
  trackId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface FlowlineRuntimeAPI {
  status(): Promise<PythonStatus>;
  install(): Promise<{ ok: boolean; error?: string }>;
  onInstallProgress(cb: (p: InstallProgressEvent) => void): () => void;
  ensureWorker(): Promise<
    | { ok: true; manifest: NodeManifestEntry[] }
    | { ok: false; error: string }
  >;
  manifest(): Promise<NodeManifestEntry[]>;
  runNode(
    request: RunNodeRequest,
  ): Promise<
    | { ok: true; result: NodeResultFrame }
    | { ok: false; error: string }
  >;
  cancelNode(reqId: string): Promise<void>;
  onNodeLog(cb: (frame: NodeLogFrame) => void): () => void;
}

declare global {
  interface Window {
    flowlineWindow?: FlowlineWindowAPI;
    flowlineRuntime?: FlowlineRuntimeAPI;
  }
}

export {};
