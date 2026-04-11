import { useCallback, useRef, useState } from 'react';
import type { Block, BlockType, Scenario, SyncPoint, Track } from './types';
import { TRACK_COLORS } from './types';
import { initialScenario } from './initialScenario';

let _uid = 1000;
export const uid = (prefix = 'id') => `${prefix}-${++_uid}`;

export interface ScenarioActions {
  scenario: Scenario;
  replace: (s: Scenario) => void;

  // tracks
  addTrack: () => void;
  deleteTrack: (id: string) => void;
  renameTrack: (id: string, name: string) => void;

  // blocks
  addBlock: (trackId: string, block: Block) => void;
  updateBlock: (trackId: string, blockId: string, patch: Partial<Block>) => void;
  deleteBlock: (trackId: string, blockId: string) => void;

  // sync points
  addSync: (sp: SyncPoint) => void;
  deleteSync: (id: string) => void;
}

export function useScenario(): ScenarioActions {
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
  const latest = useRef(scenario);
  latest.current = scenario;

  const replace = useCallback((s: Scenario) => setScenario(s), []);

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
      if (s.tracks.length <= 1) return s;
      return { ...s, tracks: s.tracks.filter((t) => t.id !== id) };
    });
  }, []);

  const renameTrack = useCallback((id: string, name: string) => {
    setScenario((s) => ({
      ...s,
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, name } : t)),
    }));
  }, []);

  const addBlock = useCallback((trackId: string, block: Block) => {
    setScenario((s) => ({
      ...s,
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, blocks: [...t.blocks, block] } : t,
      ),
    }));
  }, []);

  const updateBlock = useCallback(
    (trackId: string, blockId: string, patch: Partial<Block>) => {
      setScenario((s) => ({
        ...s,
        tracks: s.tracks.map((t) => {
          if (t.id !== trackId) return t;
          return {
            ...t,
            blocks: t.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
          };
        }),
      }));
    },
    [],
  );

  const deleteBlock = useCallback((trackId: string, blockId: string) => {
    setScenario((s) => ({
      ...s,
      tracks: s.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return { ...t, blocks: t.blocks.filter((b) => b.id !== blockId) };
      }),
      // cascade: remove deps to this block from remaining blocks and sync points
      syncPoints: s.syncPoints.map((sp) => ({
        ...sp,
        deps: sp.deps.filter((d) => d !== blockId),
      })),
    }));
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
  };
}

export function makeBlock(type: BlockType, label: string, slot: number, span = 1): Block {
  return {
    id: uid('b'),
    type,
    label,
    slot,
    span,
    deps: [],
  };
}
