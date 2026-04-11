import { useMemo } from 'react';
import type { Track } from '../types';
import { BLOCK_MARGIN, BLOCK_W, SLOT_PX, TRACK_H } from '../layout';

interface Props {
  tracks: Track[];
  totalSlots: number;
  selectedBlockId: string | null;
}

interface BlockPos {
  trackIndex: number;
  leftX: number;
  rightX: number;
  centerY: number;
}

interface Edge {
  key: string;
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * SVG overlay drawing dependency edges between blocks on regular tracks.
 * Edges render as thin curved paths from the source block's right edge
 * to the dependent block's left edge. Cross-track edges curve smoothly.
 *
 * Backward edges (dep slot ≥ target slot) *should* be impossible to
 * create through the editor — the drag handler clamps block positions
 * to their legal slot range, and the link tool swaps direction to
 * preserve left→right order. The dashed-straight-line fallback remains
 * only as a defensive render for JSON imports that might carry legacy
 * backward deps; users should never see it from fresh edits.
 *
 * Edges touching the selected block are highlighted. Rendering is
 * pointer-events: none — the overlay is purely visual.
 */
export function GraphEdges({ tracks, totalSlots, selectedBlockId }: Props) {
  const { edges, width, height } = useMemo(() => {
    const positions = new Map<string, BlockPos>();
    tracks.forEach((track, ti) => {
      for (const b of track.blocks) {
        const leftX = b.slot * SLOT_PX + BLOCK_MARGIN;
        positions.set(b.id, {
          trackIndex: ti,
          leftX,
          rightX: leftX + BLOCK_W,
          centerY: ti * TRACK_H + TRACK_H / 2,
        });
      }
    });

    const out: Edge[] = [];
    for (const track of tracks) {
      for (const b of track.blocks) {
        const toPos = positions.get(b.id);
        if (!toPos) continue;
        for (const depId of b.deps) {
          const fromPos = positions.get(depId);
          if (!fromPos) continue;
          out.push({
            key: `${depId}->${b.id}`,
            fromId: depId,
            toId: b.id,
            x1: fromPos.rightX,
            y1: fromPos.centerY,
            x2: toPos.leftX,
            y2: toPos.centerY,
          });
        }
      }
    }

    return {
      edges: out,
      width: totalSlots * SLOT_PX,
      height: tracks.length * TRACK_H,
    };
  }, [tracks, totalSlots]);

  if (edges.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <marker
          id="fl-edge-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
        </marker>
        <marker
          id="fl-edge-arrow-hot"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#60a5fa" />
        </marker>
      </defs>

      {edges.map((e) => {
        const highlighted =
          selectedBlockId !== null &&
          (selectedBlockId === e.fromId || selectedBlockId === e.toId);
        const isBackwards = e.x2 <= e.x1;
        const stroke = highlighted ? '#60a5fa' : '#475569';
        const opacity = highlighted ? 0.9 : 0.35;
        const strokeWidth = highlighted ? 1.75 : 1;
        const marker = highlighted
          ? 'url(#fl-edge-arrow-hot)'
          : 'url(#fl-edge-arrow)';

        let d: string;
        if (isBackwards) {
          // User error (dep on a later block). Draw a dashed straight line
          // so the mistake is visible.
          d = `M ${e.x1} ${e.y1} L ${e.x2} ${e.y2}`;
        } else {
          const dx = Math.max((e.x2 - e.x1) / 2, 12);
          d = `M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`;
        }

        return (
          <path
            key={e.key}
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={isBackwards ? '4 3' : undefined}
            opacity={opacity}
            markerEnd={marker}
          />
        );
      })}
    </svg>
  );
}
