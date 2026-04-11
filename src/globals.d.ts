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

declare global {
  interface Window {
    flowlineWindow?: FlowlineWindowAPI;
  }
}

export {};
