import { useCallback, useEffect, useRef, useState } from 'react';
import type { Scenario } from '../types';
import { Executor } from './executor';
import { MockRuntime, type Runtime } from './runtime';
import { IDLE_EXECUTION_STATE, type ExecutionState } from './types';

export interface UseExecution {
  state: ExecutionState;
  running: boolean;
  start: (scenario: Scenario) => void;
  abort: () => void;
  clear: () => void;
}

/**
 * React-side controller for the executor. Holds the current execution
 * snapshot in state and exposes imperative `start` / `abort` handles.
 *
 * `start` is a no-op if an execution is already running. Calling it when
 * the previous run has ended resets the state and begins a fresh run.
 */
export function useExecution(runtime: Runtime = new MockRuntime()): UseExecution {
  const [state, setState] = useState<ExecutionState>(IDLE_EXECUTION_STATE);
  const executorRef = useRef<Executor | null>(null);
  const runtimeRef = useRef<Runtime>(runtime);
  // Keep latest runtime if caller swaps (unusual, but harmless).
  runtimeRef.current = runtime;

  const start = useCallback((scenario: Scenario) => {
    if (executorRef.current) return;
    const executor = new Executor(scenario, runtimeRef.current, {
      onStateChange: (s) => setState(s),
    });
    executorRef.current = executor;
    executor
      .run()
      .catch(() => {
        /* errors are captured in state.logs */
      })
      .finally(() => {
        executorRef.current = null;
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
