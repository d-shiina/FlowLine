import { useCallback, useState } from 'react';
import type { Block, Scenario, Subroutine, SyncPoint, Track } from './types';
import { ERROR_HANDLER_COLOR, ERROR_HANDLER_ID, TRACK_COLORS } from './types';
import { DEFAULT_SAMPLE, cloneSample } from './samples';

let _uid = 1000;
export const uid = (prefix = 'id') => `${prefix}-${++_uid}`;

/**
 * Recursively shift occupants at `slot` to `slot + 1` so the slot becomes
 * free. Handles chain collisions (a block at N+1 gets pushed to N+2, etc.).
 * When moving a block, pass its id as `excludeId` to avoid "colliding with
 * itself" at its current slot.
 */
function makeRoomAt(
  blocks: Block[],
  slot: number,
  excludeId?: string,
): Block[] {
  const occupant = blocks.find((b) => b.slot === slot && b.id !== excludeId);
  if (!occupant) return blocks;
  const withRoom = makeRoomAt(blocks, slot + 1, excludeId);
  return withRoom.map((b) =>
    b.id === occupant.id ? { ...b, slot: slot + 1 } : b,
  );
}

/** Remove all references to `blockId` from deps across the scenario. */
function cascadeDeleteDep(s: Scenario, blockId: string): Scenario {
  const filterDeps = (deps: string[]) => deps.filter((d) => d !== blockId);
  const filterBlock = (b: Block) => ({ ...b, deps: filterDeps(b.deps) });
  return {
    ...s,
    tracks: s.tracks.map((t) => ({
      ...t,
      blocks: t.blocks.map(filterBlock),
    })),
    errorHandler: {
      ...s.errorHandler,
      blocks: s.errorHandler.blocks.map(filterBlock),
    },
    subroutines: s.subroutines.map((sub) => ({
      ...sub,
      blocks: sub.blocks.map(filterBlock),
    })),
    syncPoints: s.syncPoints.map((sp) => ({
      ...sp,
      deps: filterDeps(sp.deps),
    })),
  };
}

/**
 * Apply a mutation to either a regular track or the error handler track.
 * The error handler is identified by its fixed `ERROR_HANDLER_ID`.
 */
function mapTrack(
  s: Scenario,
  trackId: string,
  fn: (t: Track) => Track,
): Scenario {
  if (trackId === ERROR_HANDLER_ID) {
    return { ...s, errorHandler: fn(s.errorHandler) };
  }
  return {
    ...s,
    tracks: s.tracks.map((t) => (t.id === trackId ? fn(t) : t)),
  };
}

const HISTORY_LIMIT = 50;

interface HistoryState {
  scenario: Scenario;
  history: Scenario[];
  future: Scenario[];
}

export interface ScenarioStore {
  scenario: Scenario;
  canUndo: boolean;
  canRedo: boolean;
  replace: (s: Scenario) => void;
  undo: () => void;
  redo: () => void;

  renameScenario: (name: string) => void;

  addTrack: () => void;
  deleteTrack: (id: string) => void;
  renameTrack: (id: string, name: string) => void;

  addBlock: (trackId: string, block: Block) => void;
  updateBlock: (
    trackId: string,
    blockId: string,
    patch: Partial<Block>,
  ) => void;
  deleteBlock: (trackId: string, blockId: string) => void;

  addDep: (trackId: string, blockId: string, depId: string) => void;
  removeDep: (trackId: string, blockId: string, depId: string) => void;

  addSync: (sp: SyncPoint) => void;
  deleteSync: (id: string) => void;

  addSubroutine: (name: string) => Subroutine;
  renameSubroutine: (id: string, name: string) => void;
  deleteSubroutine: (id: string) => void;
}

export function useScenario(): ScenarioStore {
  const [state, setState] = useState<HistoryState>(() => ({
    scenario: cloneSample(DEFAULT_SAMPLE),
    history: [],
    future: [],
  }));

  /**
   * Apply an updater. If the updater returns the same reference as the
   * current scenario, skip history push (no-op). Otherwise push the
   * previous scenario onto history and clear the redo stack.
   */
  const commit = useCallback((updater: (s: Scenario) => Scenario) => {
    setState((prev) => {
      const next = updater(prev.scenario);
      if (next === prev.scenario) return prev;
      const history = [...prev.history, prev.scenario];
      if (history.length > HISTORY_LIMIT) history.shift();
      return { scenario: next, history, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.history.length === 0) return prev;
      const past = prev.history[prev.history.length - 1];
      return {
        scenario: past,
        history: prev.history.slice(0, -1),
        future: [...prev.future, prev.scenario],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[prev.future.length - 1];
      return {
        scenario: next,
        history: [...prev.history, prev.scenario],
        future: prev.future.slice(0, -1),
      };
    });
  }, []);

  const replace = useCallback(
    (incoming: Scenario) => {
      // Backward-compat: JSON saved before the errorHandler field existed.
      const withHandler: Scenario = incoming.errorHandler
        ? incoming
        : {
            ...incoming,
            errorHandler: {
              id: ERROR_HANDLER_ID,
              name: 'エラー処理',
              color: ERROR_HANDLER_COLOR,
              blocks: [],
            },
          };
      commit(() => withHandler);
    },
    [commit],
  );

  const renameScenario = useCallback(
    (name: string) => {
      commit((s) => (s.name === name ? s : { ...s, name }));
    },
    [commit],
  );

  const addTrack = useCallback(() => {
    commit((s) => {
      const color = TRACK_COLORS[s.tracks.length % TRACK_COLORS.length];
      const t: Track = {
        id: uid('track'),
        name: `トラック${s.tracks.length + 1}`,
        color,
        blocks: [],
      };
      return { ...s, tracks: [...s.tracks, t] };
    });
  }, [commit]);

  const deleteTrack = useCallback(
    (id: string) => {
      commit((s) => {
        if (id === ERROR_HANDLER_ID) return s; // cannot delete the error handler
        if (s.tracks.length <= 1) return s;
        return { ...s, tracks: s.tracks.filter((t) => t.id !== id) };
      });
    },
    [commit],
  );

  const renameTrack = useCallback(
    (id: string, name: string) => {
      commit((s) => {
        if (id === ERROR_HANDLER_ID) return s; // name is fixed
        return {
          ...s,
          tracks: s.tracks.map((t) => (t.id === id ? { ...t, name } : t)),
        };
      });
    },
    [commit],
  );

  const addBlock = useCallback(
    (trackId: string, block: Block) => {
      commit((s) =>
        mapTrack(s, trackId, (t) => {
          const withRoom = makeRoomAt(t.blocks, block.slot);
          return { ...t, blocks: [...withRoom, block] };
        }),
      );
    },
    [commit],
  );

  const updateBlock = useCallback(
    (trackId: string, blockId: string, patch: Partial<Block>) => {
      commit((s) =>
        mapTrack(s, trackId, (t) => {
          const current = t.blocks.find((b) => b.id === blockId);
          if (!current) return t;
          const slotChanged =
            patch.slot !== undefined && patch.slot !== current.slot;
          const base = slotChanged
            ? makeRoomAt(t.blocks, patch.slot as number, blockId)
            : t.blocks;
          return {
            ...t,
            blocks: base.map((b) =>
              b.id === blockId ? { ...b, ...patch } : b,
            ),
          };
        }),
      );
    },
    [commit],
  );

  const deleteBlock = useCallback(
    (trackId: string, blockId: string) => {
      commit((s) => {
        const removed = mapTrack(s, trackId, (t) => ({
          ...t,
          blocks: t.blocks.filter((b) => b.id !== blockId),
        }));
        return cascadeDeleteDep(removed, blockId);
      });
    },
    [commit],
  );

  const addDep = useCallback(
    (trackId: string, blockId: string, depId: string) => {
      if (blockId === depId) return; // no self-deps
      commit((s) =>
        mapTrack(s, trackId, (t) => ({
          ...t,
          blocks: t.blocks.map((b) => {
            if (b.id !== blockId) return b;
            if (b.deps.includes(depId)) return b;
            return { ...b, deps: [...b.deps, depId] };
          }),
        })),
      );
    },
    [commit],
  );

  const removeDep = useCallback(
    (trackId: string, blockId: string, depId: string) => {
      commit((s) =>
        mapTrack(s, trackId, (t) => ({
          ...t,
          blocks: t.blocks.map((b) =>
            b.id === blockId
              ? { ...b, deps: b.deps.filter((d) => d !== depId) }
              : b,
          ),
        })),
      );
    },
    [commit],
  );

  const addSync = useCallback(
    (sp: SyncPoint) => {
      commit((s) => ({ ...s, syncPoints: [...s.syncPoints, sp] }));
    },
    [commit],
  );

  const deleteSync = useCallback(
    (id: string) => {
      commit((s) => ({
        ...s,
        syncPoints: s.syncPoints.filter((sp) => sp.id !== id),
      }));
    },
    [commit],
  );

  const addSubroutine = useCallback(
    (name: string): Subroutine => {
      const sub: Subroutine = {
        id: uid('sub'),
        name: name.trim() || 'サブルーチン',
        blocks: [],
      };
      commit((s) => ({ ...s, subroutines: [...s.subroutines, sub] }));
      return sub;
    },
    [commit],
  );

  const renameSubroutine = useCallback(
    (id: string, name: string) => {
      commit((s) => ({
        ...s,
        subroutines: s.subroutines.map((sub) =>
          sub.id === id ? { ...sub, name: name.trim() || sub.name } : sub,
        ),
      }));
    },
    [commit],
  );

  const deleteSubroutine = useCallback(
    (id: string) => {
      commit((s) => {
        // Cascade: clear `subroutineId` on any block that referenced this
        // subroutine, across regular tracks and the error handler.
        const clearRef = (b: Block): Block =>
          b.subroutineId === id ? { ...b, subroutineId: undefined } : b;
        return {
          ...s,
          subroutines: s.subroutines.filter((sub) => sub.id !== id),
          tracks: s.tracks.map((t) => ({
            ...t,
            blocks: t.blocks.map(clearRef),
          })),
          errorHandler: {
            ...s.errorHandler,
            blocks: s.errorHandler.blocks.map(clearRef),
          },
        };
      });
    },
    [commit],
  );

  return {
    scenario: state.scenario,
    canUndo: state.history.length > 0,
    canRedo: state.future.length > 0,
    replace,
    undo,
    redo,
    renameScenario,
    addTrack,
    deleteTrack,
    renameTrack,
    addBlock,
    updateBlock,
    deleteBlock,
    addDep,
    removeDep,
    addSync,
    deleteSync,
    addSubroutine,
    renameSubroutine,
    deleteSubroutine,
  };
}
