import { RULER_H, SLOT_PX } from '../layout';

interface Props {
  totalSlots: number;
  playheadSlot: number; // -1 when idle
}

/**
 * Step ruler: renders one tick per slot. Every 5th slot is a major tick.
 */
export function Ruler({ totalSlots, playheadSlot }: Props) {
  const ticks = Array.from({ length: totalSlots + 1 }, (_, i) => i);
  return (
    <div
      className="relative select-none border-b border-fl-border bg-fl-panel"
      style={{ height: RULER_H }}
    >
      {ticks.map((t) => {
        const major = t % 5 === 0;
        return (
          <div
            key={t}
            className="pointer-events-none absolute top-0 flex h-full flex-col items-center"
            style={{ left: t * SLOT_PX }}
          >
            <div
              className="mt-auto w-px"
              style={{
                height: major ? 12 : 6,
                background: major
                  ? 'var(--fl-border-strong)'
                  : 'var(--fl-border-2)',
              }}
            />
            {major && (
              <div
                className="absolute top-1 -translate-x-1/2 font-mono text-[9px] text-fl-text-faint"
                style={{ top: 4 }}
              >
                #{t}
              </div>
            )}
          </div>
        );
      })}
      {playheadSlot >= 0 && (
        <div
          className="pointer-events-none absolute top-0 h-full w-px bg-[#22c55e]"
          style={{ left: playheadSlot * SLOT_PX }}
        />
      )}
    </div>
  );
}
