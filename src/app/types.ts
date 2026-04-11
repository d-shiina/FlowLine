/**
 * FLOWLINE scenario model.
 *
 * Unlike the seconds-based prototype, this model uses a block-based axis:
 * a block's horizontal position is its index (slot) within a track, and
 * "duration" is instead a visual width hint (number of slots). Execution
 * order is defined by `deps` (DAG edges), not by position.
 */

export type BlockType = 'action' | 'wait' | 'loop' | 'branch' | 'sync' | 'subroutine';

export interface Block {
  id: string;
  type: BlockType;
  label: string;
  /** Visual start slot on the track (0-indexed). */
  slot: number;
  /** Visual width in slots (minimum 1). */
  span: number;
  /** Ids of blocks this one depends on (DAG edges). */
  deps: string[];
  /** Error handling policy. */
  onError?: 'abort' | 'skip' | { retry: number; then: 'abort' | 'skip' };
  /** Action-specific params (free-form). */
  params?: Record<string, unknown>;
  /** Scenario/track variable references. */
  inputs?: string[];
  outputs?: string[];
}

export interface Track {
  id: string;
  name: string;
  color: string;
  blocks: Block[];
  variables?: {
    track?: Record<string, unknown>;
  };
}

export interface SyncPoint {
  id: string;
  label: string;
  /** Visual slot where the sync line is drawn. */
  slot: number;
  /** Ids of blocks that must all complete before sync passes. */
  deps: string[];
  /** Track ids this sync spans (for visualization). Empty = all tracks. */
  trackIds: string[];
}

export interface Subroutine {
  id: string;
  name: string;
  blocks: Block[];
}

export interface Scenario {
  version: '1.0';
  name: string;
  variables: {
    scenario: Record<string, unknown>;
  };
  tracks: Track[];
  syncPoints: SyncPoint[];
  subroutines: Subroutine[];
}

export const BLOCK_META: Record<
  BlockType,
  { color: string; icon: string; label: string }
> = {
  action: { color: '#3B82F6', icon: '▶', label: 'アクション' },
  wait: { color: '#06B6D4', icon: '⏸', label: '待機' },
  loop: { color: '#8B5CF6', icon: '↻', label: 'ループ' },
  branch: { color: '#F59E0B', icon: '⑂', label: '分岐' },
  sync: { color: '#F43F5E', icon: '⬡', label: '同期' },
  subroutine: { color: '#94A3B8', icon: '⎔', label: 'サブルーチン' },
};

export const TRACK_COLORS = [
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
  '#8B5CF6',
];
