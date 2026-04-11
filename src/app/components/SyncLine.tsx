import { useState } from 'react';
import type { SyncPoint } from '../types';
import { SLOT_PX } from '../layout';

interface Props {
  sp: SyncPoint;
  totalHeight: number;
  onDelete: (id: string) => void;
}

/**
 * Sync point rendered as a vertical diamond-topped bar across tracks.
 * Click to delete.
 */
export function SyncLine({ sp, totalHeight, onDelete }: Props) {
  const [hov, setHov] = useState(false);
  const x = sp.slot * SLOT_PX;
  return (
    <div
      className="absolute top-0 cursor-pointer"
      style={{
        left: x,
        width: 2,
        height: totalHeight,
        background: hov ? '#f43f5e' : '#f43f5e88',
        transition: 'background 0.15s',
        zIndex: 10,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onDelete(sp.id)}
      title={`同期ポイント: #${sp.slot} — クリックで削除`}
    >
      {/* diamond */}
      <div
        className="absolute -top-2 left-1/2 -translate-x-1/2 rotate-45 rounded-sm bg-[#f43f5e]"
        style={{ width: 12, height: 12 }}
      />
      {/* label */}
      <div
        className="absolute whitespace-nowrap font-mono text-[9px] font-bold tracking-wider text-[#f43f5e]"
        style={{ top: 14, left: 6 }}
      >
        {sp.label} #{sp.slot}
      </div>
    </div>
  );
}
