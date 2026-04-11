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

export interface ScenarioStore {
  scenario: Scenario;
  replace: (s: Scenario) => void;

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

  addSync: (sp: SyncPoint) => void;
  deleteSync: (id: string) => void;

  addSubroutine: (name: string) => Subroutine;
  renameSubroutine: (id: string, name: string) => void;
  deleteSubroutine: (id: string) => void;
}

export function useScenario(): ScenarioStore {
  const [scenario, setScenario] = useState<Scenario>(() =>
    cloneSample(DEFAULT_SAMPLE),
  );

  const replace = useCallback((incoming: Scenario) => {
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
    setScenario(withHandler);
  }, []);

  const addTrack = useCallback(() => {
    setScenario((s) => {
      const color = TRACK_COLORS[s.tracks.length % TRACK_COLORS.length];
      const t: Track = {
        id: uid('track'),
        name: `トラック${s.tracks.length + 1}`,
        color,
        blocks: [],
      };
      return { ...s, tracks: [...s.tracks, t] };
    });
  }, []);

  const deleteTrack = useCallback((id: string) => {
    setScenario((s) => {
      if (id === ERROR_HANDLER_ID) return s; // cannot delete the error handler
      if (s.tracks.length <= 1) return s;
      return { ...s, tracks: s.tracks.filter((t) => t.id !== id) };
    });
  }, []);

  const renameTrack = useCallback((id: string, name: string) => {
    setScenario((s) => {
      if (id === ERROR_HANDLER_ID) return s; // name is fixed
      return {
        ...s,
        tracks: s.tracks.map((t) => (t.id === id ? { ...t, name } : t)),
      };
    });
  }, []);

  const addBlock = useCallback((trackId: string, block: Block) => {
    setScenario((s) =>
      mapTrack(s, trackId, (t) => {
        const withRoom = makeRoomAt(t.blocks, block.slot);
        return { ...t, blocks: [...withRoom, block] };
      }),
    );
  }, []);

  const updateBlock = useCallback(
    (trackId: string, blockId: string, patch: Partial<Block>) => {
      setScenario((s) =>
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
    [],
  );

  const deleteBlock = useCallback((trackId: string, blockId: string) => {
    setScenario((s) => {
      const removed = mapTrack(s, trackId, (t) => ({
        ...t,
        blocks: t.blocks.filter((b) => b.id !== blockId),
      }));
      return cascadeDeleteDep(removed, blockId);
    });
  }, []);

  const addSync = useCallback((sp: SyncPoint) => {
    setScenario((s) => ({ ...s, syncPoints: [...s.syncPoints, sp] }));
  }, []);

  const deleteSync = useCallback((id: string) => {
    setScenario((s) => ({
      ...s,
      syncPoints: s.syncPoints.filter((sp) => sp.id !== id),
    }));
  }, []);

  const addSubroutine = useCallback((name: string): Subroutine => {
    const sub: Subroutine = {
      id: uid('sub'),
      name: name.trim() || 'サブルーチン',
      blocks: [],
    };
    setScenario((s) => ({ ...s, subroutines: [...s.subroutines, sub] }));
    return sub;
  }, []);

  const renameSubroutine = useCallback((id: string, name: string) => {
    setScenario((s) => ({
      ...s,
      subroutines: s.subroutines.map((sub) =>
        sub.id === id ? { ...sub, name: name.trim() || sub.name } : sub,
      ),
    }));
  }, []);

  const deleteSubroutine = useCallback((id: string) => {
    setScenario((s) => {
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
  }, []);

  return {
    scenario,
    replace,
    addTrack,
    deleteTrack,
    renameTrack,
    addBlock,
    updateBlock,
    deleteBlock,
    addSync,
    deleteSync,
    addSubroutine,
    renameSubroutine,
    deleteSubroutine,
  };
}
