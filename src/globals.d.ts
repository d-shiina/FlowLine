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

export interface FlowlineRuntimeAPI {
  status(): Promise<PythonStatus>;
  install(): Promise<{ ok: boolean; error?: string }>;
  onInstallProgress(cb: (p: InstallProgressEvent) => void): () => void;
}

declare global {
  interface Window {
    flowlineWindow?: FlowlineWindowAPI;
    flowlineRuntime?: FlowlineRuntimeAPI;
  }
}

export {};
