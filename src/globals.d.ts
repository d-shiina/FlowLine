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

export interface NodeFileEntry {
  path: string;
  size: number;
}

export interface NodeLoadError {
  path: string;
  module: string;
  message: string;
  traceback: string;
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
  // Node editor
  listNodeFiles(): Promise<
    { ok: true; files: NodeFileEntry[] } | { ok: false; error: string }
  >;
  readNodeSource(
    relPath: string,
  ): Promise<
    | { ok: true; source: string | null }
    | { ok: false; error: string }
  >;
  writeNodeSource(
    relPath: string,
    source: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  deleteNodeSource(
    relPath: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  pipInstall(
    packages: string[],
    postCommands?: string[][],
  ): Promise<{ ok: boolean; output: string; error?: string }>;
  pipList(): Promise<{ ok: boolean; packages: string[]; error?: string }>;
  onPipProgress(cb: (event: { message: string }) => void): () => void;
  reloadNodes(): Promise<
    | { ok: true; manifest: NodeManifestEntry[]; loadErrors: NodeLoadError[] }
    | { ok: false; error: string }
  >;
  loadErrors(): Promise<NodeLoadError[]>;
}

export interface FlowlineScenarioAPI {
  exportFile(
    scenarioJson: string,
    nodeIds: string[],
    manifest: unknown[],
  ): Promise<{ ok: boolean; filePath?: string; error?: string }>;
  importFile(): Promise<{
    ok: boolean;
    scenario?: unknown;
    installedNodes: string[];
    updatedNodes: string[];
    skippedNodes: string[];
    error?: string;
  }>;
}

declare global {
  interface Window {
    flowlineWindow?: FlowlineWindowAPI;
    flowlineRuntime?: FlowlineRuntimeAPI;
    flowlineScenario?: FlowlineScenarioAPI;
  }
}

export {};
