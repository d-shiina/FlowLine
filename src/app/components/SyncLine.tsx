import { useState } from 'react';
import type { SyncPoint } from '../types';
import { SLOT_PX } from '../layout';

interface Props {
  sp: SyncPoint;
  /** Height of each regular track in px. */
  trackHeights: number[];
  /** Top edge of each regular track in canvas-local px. */
  trackTops: number[];
  /** Sum of all track heights — height of the sync overlay. */
  totalHeight: number;
  onDelete: (id: string) => void;
}

/**
 * Sync point rendered as a dashed vertical barrier with horizontal
 * tick bars at every track boundary.  Visually communicates "all
 * tracks must reach this gate before execution continues".
 * Click to delete.
 */
export function SyncLine({
  sp,
  trackHeights,
  trackTops,
  totalHeight,
  onDelete,
}: Props) {
  const [hov, setHov] = useState(false);
  const x = sp.slot * SLOT_PX;

  const lineColor = hov ? '#f43f5e' : '#f43f5e66';
  const barColor = hov ? '#f43f5e' : '#f43f5e88';

  // Boundary Y positions: top of every track + the very bottom edge.
  const boundaries = [...trackTops, totalHeight];

  return (
    <div
      className="pointer-events-auto absolute top-0 cursor-pointer"
      style={{
        left: x,
        width: 16,
        height: totalHeight,
        zIndex: 10,
        transform: 'translateX(-7px)',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onDelete(sp.id)}
      title={`同期ポイント: ${sp.label} #${sp.slot}\nslot ${sp.slot} より前の全ブロック完了を待機`}
    >
      {/* Dashed vertical line centred in the 16 px container */}
      <div
        className="absolute top-0"
        style={{
          left: 7,
          width: 0,
          height: totalHeight,
          borderLeft: `2px dashed ${lineColor}`,
          transition: 'border-color 0.15s',
        }}
      />

      {/* Horizontal tick bars at each track boundary */}
      {boundaries.map((y, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: y - 1,
            left: 0,
            width: 16,
            height: 2,
            background: barColor,
            borderRadius: 1,
            transition: 'background 0.15s',
          }}
        />
      ))}

      {/* Per-track height tick bars (bottom edge of each track) */}
      {trackTops.map((top, i) => {
        const bottom = top + trackHeights[i];
        // Skip if already covered by boundaries (top already included above)
        return bottom === totalHeight ? null : (
          <div
            key={`b-${i}`}
            className="absolute"
            style={{
              top: bottom - 1,
              left: 0,
              width: 16,
              height: 2,
              background: barColor,
              borderRadius: 1,
              transition: 'background 0.15s',
            }}
          />
        );
      })}

      {/* Label */}
      <div
        className="pointer-events-none absolute whitespace-nowrap font-mono text-[9px] font-bold tracking-wider"
        style={{
          top: 4,
          left: 12,
          color: hov ? '#f43f5e' : '#f43f5ecc',
          transition: 'color 0.15s',
        }}
      >
        ‖ {sp.label} #{sp.slot}
      </div>
    </div>
  );
}
