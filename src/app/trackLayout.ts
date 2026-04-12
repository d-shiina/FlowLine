import type { Block, Track } from './types';
import { BLOCK_META } from './types';
import { BLOCK_MARGIN, BLOCK_W, LANE_H, SLOT_PX, TRACK_H } from './layout';
import { summarizeExpression } from './engine/jsonLogic';

/**
 * Shared layout math for the FLOWLINE timeline — the single source
 * of truth for every pixel-level decision the canvas makes.
 *
 * Without this, four places ended up recomputing the same geometry
 * and drifting: TrackRow for frame / lane rendering, BlockView for
 * per-block Y offset, GraphEdges for arrow routing, and App for the
 * overlay container height. All of them now call into one of the
 * two entry points here:
 *
 * - ``computeTrackLayout(track)``  — single track, used by TrackRow
 *   and BlockView. Returns container frames, per-block lane info,
 *   per-block boxes, and the dynamic track height.
 * - ``computeTracksLayout(tracks)`` — whole canvas, used by
 *   GraphEdges to route arrows across tracks and by App to size the
 *   overlay that hosts them. Stitches per-track layouts together
 *   with running Y offsets.
 *
 * Layout invariants (must stay coherent with BlockView rendering):
 *
 * 1. Every loop / branch / switch renders as its own frame; the
 *    container block itself doesn't draw a standalone card, so its
 *    "position" is the frame header's centre.
 * 2. Frames span ``[min(parent.slot, minChildSlot),
 *    max(parent.slot, maxChildSlot)]``. Empty containers collapse
 *    to 1 slot wide at ``parent.slot`` so the first child lands
 *    flush against the header.
 * 3. Each container header is ``FRAME_HEADER_H`` px tall;
 *    children live below it. Branches and switches split the body
 *    into N lanes; loops and single-lane fallbacks fill the whole
 *    body.
 * 4. Track height grows from ``TRACK_H`` (baseline) to
 *    ``FRAME_HEADER_H + maxLanes * LANE_H + 16`` when a lane stack
 *    needs more space.
 * 5. Top-level (non-nested) regular blocks get the full row height.
 */

/** Height of every container frame's coloured header strip, in px. */
export const FRAME_HEADER_H = 16;
const FRAME_INSET = 3;

/** Box used by GraphEdges to attach arrow endpoints. */
export interface BlockLayoutBox {
  leftX: number;
  rightX: number;
  y: number;
}

/** Lane assignment for a block nested inside a container. */
export interface BlockLaneInfo {
  laneIndex: number;
  laneCount: number;
  color: string;
}

/** Container frame rectangle + metadata — consumed by TrackRow / BlockView. */
export interface ContainerFrame {
  block: Block;
  parentType: 'loop' | 'branch' | 'switch';
  label: string;
  color: string;
  fromSlot: number;
  toSlot: number;
  /** True when the container has no children yet (ghost drop zone). */
  empty: boolean;
  /** Lane labels top-to-bottom. Single-entry `['']` for loops. */
  cases: string[];
  /** Short one-liner rendered on the right edge of the header. */
  summary: string;
}

/** Result of laying out a single track. */
export interface TrackLayout {
  /** Dynamic height of the track row in pixels. */
  trackHeight: number;
  /** Container frames to render behind the blocks. */
  containerFrames: ContainerFrame[];
  /** Lane info for every child of a container, keyed by block id. */
  blockLanes: Map<string, BlockLaneInfo>;
  /**
   * Per-block boxes in *track-local* coordinates (y = 0 at the top
   * of the track row). ``computeTracksLayout`` shifts these into
   * canvas coordinates for GraphEdges.
   */
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
  /** Sum of ``perTrack[i].trackHeight`` — overlay height. */
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
 * Short description rendered on the right edge of a container's
 * header bar. Loops show iteration count or ``while …``, branches
 * show their condition in infix form, switches show the evaluated
 * expression plus case count. Capped at 32 chars so the header
 * doesn't overflow on complex expressions.
 */
function summarizeContainer(block: Block, cases: string[]): string {
  const params =
    (block.params as Record<string, unknown> | undefined) ?? {};
  let summary = '';
  if (block.type === 'loop') {
    if (params.whileCondition !== undefined) {
      const s = summarizeExpression(params.whileCondition);
      summary = s ? `while ${s}` : 'while';
    } else if (typeof params.iterations === 'number') {
      summary = `× ${params.iterations}`;
    }
  } else if (block.type === 'branch') {
    summary = summarizeExpression(params.condition) || '';
  } else if (block.type === 'switch') {
    const s = summarizeExpression(params.expression);
    summary = s ? `${s} → ${cases.length}` : `${cases.length} cases`;
  }
  if (summary.length > 32) summary = summary.slice(0, 30) + '…';
  return summary;
}

/**
 * Lay out a single track. Called by TrackRow (for rendering) and by
 * ``computeTracksLayout`` (for stitching multi-track arrow routing).
 * Track-local Y axis: 0 at the top of the row.
 */
export function computeTrackLayout(track: Track): TrackLayout {
  const containerFrames: ContainerFrame[] = [];
  const casesByParent = new Map<string, string[]>();
  let maxLanes = 1;

  for (const parent of track.blocks) {
    if (
      parent.type !== 'loop' &&
      parent.type !== 'branch' &&
      parent.type !== 'switch'
    ) {
      continue;
    }
    const cases = casesForContainer(parent);
    casesByParent.set(parent.id, cases);
    if (cases.length > maxLanes) maxLanes = cases.length;

    const children = track.blocks.filter(
      (b) => b.parentBlockId === parent.id,
    );
    let fromSlot: number;
    let toSlot: number;
    let empty = false;
    if (children.length === 0) {
      fromSlot = parent.slot;
      toSlot = parent.slot;
      empty = true;
    } else {
      const childSlots = children.map((c) => c.slot);
      fromSlot = Math.min(parent.slot, ...childSlots);
      toSlot = Math.max(parent.slot, ...childSlots);
    }

    containerFrames.push({
      block: parent,
      parentType: parent.type,
      label: parent.label,
      color: BLOCK_META[parent.type].color,
      fromSlot,
      toSlot,
      empty,
      cases,
      summary: summarizeContainer(parent, cases),
    });
  }
  containerFrames.sort((a, b) => a.fromSlot - b.fromSlot);

  const trackHeight = Math.max(
    TRACK_H,
    FRAME_HEADER_H + maxLanes * LANE_H + 16,
  );
  const bodyTopY = FRAME_INSET + FRAME_HEADER_H;
  const bodyH = trackHeight - FRAME_HEADER_H - FRAME_INSET * 2;
  const headerCenterY = FRAME_INSET + FRAME_HEADER_H / 2;

  const blockLanes = new Map<string, BlockLaneInfo>();
  const blocks = new Map<string, BlockLayoutBox>();

  for (const b of track.blocks) {
    // Container blocks are rendered as frames — their "position"
    // is the frame rectangle + header centre, so arrows attach
    // cleanly to the header bar.
    if (
      b.type === 'loop' ||
      b.type === 'branch' ||
      b.type === 'switch'
    ) {
      const frame = containerFrames.find((f) => f.block.id === b.id);
      if (!frame) continue;
      blocks.set(b.id, {
        leftX: frame.fromSlot * SLOT_PX + BLOCK_MARGIN / 2,
        rightX: (frame.toSlot + 1) * SLOT_PX - BLOCK_MARGIN / 2,
        y: headerCenterY,
      });
      continue;
    }

    const leftX = b.slot * SLOT_PX + BLOCK_MARGIN;
    const rightX = leftX + BLOCK_W;

    // Children of a container: compute lane offset. Loops + single-
    // lane fallbacks get lane 0 which still offsets them below the
    // header.
    if (b.parentBlockId) {
      const parentFrame = containerFrames.find(
        (f) => f.block.id === b.parentBlockId,
      );
      if (parentFrame) {
        const cases = parentFrame.cases;
        const laneIndex =
          cases.length > 1
            ? Math.max(0, cases.indexOf(b.parentBranch ?? cases[0]))
            : 0;
        blockLanes.set(b.id, {
          laneIndex,
          laneCount: cases.length,
          color: parentFrame.color,
        });
        const laneH = bodyH / Math.max(1, cases.length);
        blocks.set(b.id, {
          leftX,
          rightX,
          y: bodyTopY + laneIndex * laneH + laneH / 2,
        });
        continue;
      }
    }

    // Top-level regular block — full row height.
    blocks.set(b.id, {
      leftX,
      rightX,
      y: trackHeight / 2,
    });
  }

  return { trackHeight, containerFrames, blockLanes, blocks };
}

/**
 * Lay out every regular track and stitch their per-track Y
 * coordinates into a single canvas-coordinate space so GraphEdges
 * can route arrows between blocks on different tracks.
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
      positions.set(id, {
        leftX: box.leftX,
        rightX: box.rightX,
        y: accY + box.y,
      });
    }
    accY += layout.trackHeight;
  }

  return { perTrack, trackTops, positions, totalHeight: accY };
}
