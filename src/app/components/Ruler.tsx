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
      className="relative select-none border-b border-[#0f172a] bg-[#0a1020]"
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
                background: major ? '#334155' : '#1e293b',
              }}
            />
            {major && (
              <div
                className="absolute top-1 -translate-x-1/2 font-mono text-[9px] text-slate-600"
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
          className="pointer-events-none absolute top-0 h-full w-px bg-[color:var(--color-fl-play)]"
          style={{ left: playheadSlot * SLOT_PX }}
        />
      )}
    </div>
  );
}
