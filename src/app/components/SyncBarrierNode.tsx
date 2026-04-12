import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { X } from 'lucide-react';

export interface SyncBarrierNodeData {
  label: string;
  slot: number;
  height: number;
  /** Per-track status at this barrier: 'done' | 'waiting' | 'pending'. */
  trackStates?: Array<{ trackId: string; trackName: string; trackColor: string; state: 'done' | 'waiting' | 'pending' }>;
  onDelete: () => void;
  [key: string]: unknown;
}

/**
 * Vertical barrier spanning all tracks at a given slot.
 * Execution pauses until all tracks reach this point.
 */
export const SyncBarrierNode = memo(function SyncBarrierNode({
  data,
}: NodeProps) {
  const d = data as unknown as SyncBarrierNodeData;
  const { label, slot, height, onDelete } = d;

  const anyWaiting = d.trackStates?.some((t) => t.state === 'waiting');

  return (
    <div
      className="group relative flex flex-col items-center"
      style={{ width: 28, height }}
    >
      {/* Label at top */}
      <div
        className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-fl-panel px-1 py-px font-mono text-[8px] font-bold text-[#f43f5e] shadow"
        style={{ border: '1px solid #f43f5e44' }}
      >
        ‖ {label} #{slot}
      </div>

      {/* Vertical dashed barrier line */}
      <div
        className="absolute left-1/2 top-0 h-full w-0 -translate-x-1/2"
        style={{
          borderLeft: `2px dashed ${anyWaiting ? '#f43f5e' : '#f43f5e88'}`,
          animation: anyWaiting ? 'flowline-pulse 1.5s ease-in-out infinite' : undefined,
        }}
      />

      {/* Per-track state dots */}
      {d.trackStates?.map((t, i) => (
        <div
          key={t.trackId}
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: `${(i + 0.5) * (height / (d.trackStates?.length ?? 1))}px`,
          }}
        >
          <div
            className="h-2 w-2 rounded-full"
            style={{
              background:
                t.state === 'done'
                  ? t.trackColor
                  : t.state === 'waiting'
                    ? '#f43f5e'
                    : 'transparent',
              border: `1.5px solid ${t.trackColor}`,
              boxShadow:
                t.state === 'waiting' ? '0 0 6px #f43f5eaa' : 'none',
            }}
            title={`${t.trackName}: ${t.state}`}
          />
        </div>
      ))}

      {/* Delete button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute -top-6 right-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500/80 text-[9px] text-white opacity-0 transition hover:bg-red-500 group-hover:opacity-100"
        title="同期ポイントを削除"
      >
        <X className="h-2 w-2" />
      </button>
    </div>
  );
});
