import { useCallback, useEffect, useRef, useState } from 'react';
import type { Scenario } from '../types';
import { Executor, type ExecutionOptions } from './executor';
import { IpcRuntime } from './ipcRuntime';
import { MockRuntime, type Runtime } from './runtime';
import { IDLE_EXECUTION_STATE, type ExecutionState } from './types';

export interface UseExecution {
  state: ExecutionState;
  running: boolean;
  start: (scenario: Scenario, options?: ExecutionOptions) => void;
  abort: () => void;
  clear: () => void;
}

/**
 * React-side controller for the executor. Holds the current execution
 * snapshot in state and exposes imperative `start` / `abort` handles.
 *
 * Runtime selection:
 *
 * - If the Python worker boots (manifest non-empty) → use `IpcRuntime`
 *   so actual Python nodes run in the isolated interpreter.
 * - Otherwise (Python not installed, worker crashed, etc.) → fall back
 *   to `MockRuntime` so the UI stays usable for editing without a
 *   Python dependency.
 *
 * The fallback is silent: the user still gets a running scenario with
 * mock latency and can edit freely. The Python chip in the toolbar
 * is the place to surface runtime health — not the Run button.
 */
export function useExecution(): UseExecution {
  const [state, setState] = useState<ExecutionState>(IDLE_EXECUTION_STATE);
  const executorRef = useRef<Executor | null>(null);
  const ipcRuntimeRef = useRef<IpcRuntime | null>(null);

  const start = useCallback((scenario: Scenario, options?: ExecutionOptions) => {
    if (executorRef.current) return;

    // Kick off an async boot of the Python worker in parallel with
    // starting the executor. If Python is installed and the worker
    // is ready, we use IpcRuntime; otherwise fall back to Mock.
    const launch = async (): Promise<Runtime> => {
      try {
        const runtime = await IpcRuntime.create();
        if (runtime.hasNodes()) {
          ipcRuntimeRef.current = runtime;
          return runtime;
        }
        runtime.dispose();
      } catch {
        // flowlineRuntime bridge missing, python not installed, or
        // worker failed to start — all paths land here. MockRuntime
        // keeps the UI usable.
      }
      return new MockRuntime();
    };

    void launch().then((runtime) => {
      // If the user hit Stop before the runtime finished booting,
      // bail out without starting an executor.
      if (executorRef.current) return;
      const executor = new Executor(
        scenario,
        runtime,
        { onStateChange: (s) => setState(s) },
        options,
      );
      executorRef.current = executor;
      executor
        .run()
        .catch(() => {
          /* errors are captured in state.logs */
        })
        .finally(() => {
          executorRef.current = null;
          // Drop the log subscription once the run ends. A fresh
          // runtime is created for the next Run so stale routes
          // can't leak across executions.
          if (ipcRuntimeRef.current) {
            ipcRuntimeRef.current.dispose();
            ipcRuntimeRef.current = null;
          }
        });
    });
  }, []);

  const abort = useCallback(() => {
    executorRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    if (executorRef.current) return;
    setState(IDLE_EXECUTION_STATE);
  }, []);

  // On unmount, stop any in-flight execution so setState doesn't fire
  // against a torn-down component.
  useEffect(() => {
    return () => {
      executorRef.current?.abort();
      executorRef.current = null;
      if (ipcRuntimeRef.current) {
        ipcRuntimeRef.current.dispose();
        ipcRuntimeRef.current = null;
      }
    };
  }, []);

  return {
    state,
    running: state.running,
    start,
    abort,
    clear,
  };
}
