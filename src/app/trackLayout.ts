import type { Block, Track } from './types';
import { BLOCK_MARGIN, BLOCK_W, LANE_H, SLOT_PX, TRACK_H } from './layout';

/**
 * Shared layout math for the FLOWLINE timeline.
 *
 * Both TrackRow (via its own memo) and GraphEdges (via this
 * helper) need to know the vertical position of every block so
 * the rendered block itself and the dep arrows pointing at it
 * agree on where it is. Since tracks now grow dynamically for
 * multi-lane containers (branch/switch) and children are offset
 * by a 16 px header strip, a shared computation is cheaper than
 * re-deriving the numbers in two places and drifting over time.
 *
 * Positions are in **container-local pixels** — the y axis
 * starts at 0 for the first regular track and increases
 * downwards, matching the overlay div TrackRow is wrapped in.
 */

/** Matches the 16 px header drawn inside every container frame. */
export const FRAME_HEADER_H = 16;
const FRAME_INSET = 3;

export interface BlockLayoutBox {
  /** Left edge in canvas pixels (same as BlockView's `left`). */
  leftX: number;
  /** Right edge (leftX + width). Full frame width for containers. */
  rightX: number;
  /** Vertical centre — the Y arrows should target / originate. */
  y: number;
}

export interface TracksLayout {
  /** Block id → position + width used for arrow routing. */
  positions: Map<string, BlockLayoutBox>;
  /** Top edge of each track in canvas pixels, aligned with tracks[i]. */
  trackTops: number[];
  /** Dynamic height of each track in canvas pixels. */
  trackHeights: number[];
  /** Sum of `trackHeights` — overlay height consumers use this. */
  totalHeight: number;
}

/** Derive the case / lane list for any container block. */
export function casesForContainer(block: Block): string[] {
  if (block.type === 'branch') return ['then', 'else'];
  if (block.type === 'switch') {
    const cases = (block.params as { cases?: unknown } | undefined)?.cases;
    if (Array.isArray(cases) && cases.length > 0) {
      return (cases as unknown[]).map((c) => String(c));
    }
    return ['case_0'];
  }
  return [''];
}

/**
 * Walk every track and derive block boxes + track heights.
 *
 * Layout rules (must stay in sync with TrackRow / BlockView):
 *
 * 1. Per track, scan for loop/branch/switch blocks and compute
 *    `maxLanes = max(casesForContainer(c).length)`. The track
 *    grows from TRACK_H to `FRAME_HEADER_H + maxLanes * LANE_H +
 *    16` when that's larger, matching TrackRow's calculation.
 * 2. Container blocks render as frames, not standalone cards.
 *    Their Y is the vertical centre of the header strip (so
 *    arrows enter/leave cleanly), and their X span covers
 *    `[fromSlot, toSlot]` based on the block's slot plus its
 *    children's slots.
 * 3. Children of a container sit below the header. Multi-lane
 *    containers split the remaining body height among cases;
 *    loops and single-lane fallbacks fill the whole body.
 * 4. Top-level regular blocks keep the full-row Y (track centre),
 *    matching BlockView's default placement.
 */
export function computeTracksLayout(tracks: Track[]): TracksLayout {
  const positions = new Map<string, BlockLayoutBox>();
  const trackTops: number[] = [];
  const trackHeights: number[] = [];

  let accY = 0;
  for (const track of tracks) {
    const containers = track.blocks.filter(
      (b) =>
        b.type === 'loop' || b.type === 'branch' || b.type === 'switch',
    );
    const casesByParent = new Map<string, string[]>();
    let maxLanes = 1;
    for (const parent of containers) {
      const cases = casesForContainer(parent);
      casesByParent.set(parent.id, cases);
      if (cases.length > maxLanes) maxLanes = cases.length;
    }
    const trackH = Math.max(
      TRACK_H,
      FRAME_HEADER_H + maxLanes * LANE_H + 16,
    );
    trackTops.push(accY);
    trackHeights.push(trackH);

    const headerCenterY = accY + FRAME_INSET + FRAME_HEADER_H / 2;
    const bodyTopY = accY + FRAME_INSET + FRAME_HEADER_H;
    const bodyH = trackH - FRAME_HEADER_H - FRAME_INSET * 2;

    for (const b of track.blocks) {
      if (
        b.type === 'loop' ||
        b.type === 'branch' ||
        b.type === 'switch'
      ) {
        // Frame spans from fromSlot (container slot or leftmost
        // child) to toSlot (rightmost child, or container.slot+1
        // for an empty ghost frame).
        const children = track.blocks.filter((c) => c.parentBlockId === b.id);
        let fromSlot = b.slot;
        let toSlot = b.slot;
        if (children.length === 0) {
          toSlot = b.slot + 1;
        } else {
          fromSlot = Math.min(b.slot, ...children.map((c) => c.slot));
          toSlot = Math.max(b.slot, ...children.map((c) => c.slot));
        }
        const leftX = fromSlot * SLOT_PX + BLOCK_MARGIN / 2;
        const rightX = (toSlot + 1) * SLOT_PX - BLOCK_MARGIN / 2;
        positions.set(b.id, { leftX, rightX, y: headerCenterY });
        continue;
      }

      const leftX = b.slot * SLOT_PX + BLOCK_MARGIN;
      const rightX = leftX + BLOCK_W;

      if (b.parentBlockId) {
        const cases = casesByParent.get(b.parentBlockId) ?? [''];
        const laneIdx =
          cases.length > 1
            ? Math.max(0, cases.indexOf(b.parentBranch ?? cases[0]))
            : 0;
        const laneH = bodyH / Math.max(1, cases.length);
        const y = bodyTopY + laneIdx * laneH + laneH / 2;
        positions.set(b.id, { leftX, rightX, y });
        continue;
      }

      // Top-level regular block — full-row centre.
      positions.set(b.id, {
        leftX,
        rightX,
        y: accY + trackH / 2,
      });
    }

    accY += trackH;
  }

  return { positions, trackTops, trackHeights, totalHeight: accY };
}
