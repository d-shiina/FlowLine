import type { Track } from './types';
import { BLOCK_MARGIN, BLOCK_W, SLOT_PX, TRACK_H } from './layout';

/** Box used by sync-line routing to attach endpoints. */
export interface BlockLayoutBox {
  leftX: number;
  rightX: number;
  y: number;
}

/** Result of laying out a single track. */
export interface TrackLayout {
  /** Height of the track row in pixels (fixed TRACK_H). */
  trackHeight: number;
  /** Per-block boxes in track-local coordinates. */
  blocks: Map<string, BlockLayoutBox>;
}

/** Result of laying out every regular track. */
export interface TracksLayout {
  /** Track-local layouts, aligned with ``tracks[i]``. */
  perTrack: TrackLayout[];
  /** Top edge of each track in canvas pixels. */
  trackTops: number[];
  /** Per-block boxes in canvas coordinates (y already offset). */
  positions: Map<string, BlockLayoutBox>;
  /** Sum of per-track heights — overlay height for sync lines. */
  totalHeight: number;
}

/**
 * Lay out a single track. All blocks render as equal-height cards;
 * there are no container frames or lane splits in the new model.
 */
export function computeTrackLayout(track: Track): TrackLayout {
  const trackHeight = TRACK_H;
  const blocks = new Map<string, BlockLayoutBox>();

  for (const b of track.blocks) {
    const leftX = b.slot * SLOT_PX + BLOCK_MARGIN;
    const rightX = leftX + BLOCK_W;
    blocks.set(b.id, { leftX, rightX, y: trackHeight / 2 });
  }

  return { trackHeight, blocks };
}

/**
 * Lay out every regular track and stitch per-track Y coordinates into
 * canvas space for sync line rendering.
 */
export function computeTracksLayout(tracks: Track[]): TracksLayout {
  const perTrack: TrackLayout[] = [];
  const trackTops: number[] = [];
  const positions = new Map<string, BlockLayoutBox>();

  let accY = 0;
  for (const track of tracks) {
    const layout = computeTrackLayout(track);
    perTrack.push(layout);
    trackTops.push(accY);
    for (const [id, box] of layout.blocks) {
      positions.set(id, { leftX: box.leftX, rightX: box.rightX, y: accY + box.y });
    }
    accY += layout.trackHeight;
  }

  return { perTrack, trackTops, positions, totalHeight: accY };
}
