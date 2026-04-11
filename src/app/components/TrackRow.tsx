import { useState } from 'react';
import type { Block, Track } from '../types';
import { HEADER_W, SLOT_PX, TRACK_H, pxToSlot } from '../layout';
import { BlockView } from './BlockView';

interface Props {
  track: Track;
  totalSlots: number;
  playheadSlot: number;
  selectedBlockId: string | null;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onUpdateBlock: (trackId: string, blockId: string, patch: Partial<Block>) => void;
  onDeleteBlock: (trackId: string, blockId: string) => void;
  onSelectBlock: (trackId: string, blockId: string) => void;
  onCanvasClick: (trackId: string, slot: number) => void;
}

export function TrackRow({
  track,
  totalSlots,
  playheadSlot,
  selectedBlockId,
  onRename,
  onDelete,
  onUpdateBlock,
  onDeleteBlock,
  onSelectBlock,
  onCanvasClick,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(track.name);

  const commitRename = () => {
    onRename(track.id, nameVal.trim() || track.name);
    setRenaming(false);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const slot = pxToSlot(e.clientX - rect.left);
    onCanvasClick(track.id, slot);
  };

  return (
    <div
      className="flex border-b border-[#0a0f1e]"
      style={{ height: TRACK_H }}
    >
      {/* header */}
      <div
        className="flex flex-shrink-0 flex-col justify-between bg-[#0a1020] px-3 py-2"
        style={{
          width: HEADER_W,
          borderRight: `3px solid ${track.color}`,
        }}
      >
        {renaming ? (
          <input
            autoFocus
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setNameVal(track.name);
                setRenaming(false);
              }
            }}
            className="w-full rounded border bg-[#1e293b] px-1.5 py-0.5 font-mono text-[11px] text-slate-200 outline-none"
            style={{ borderColor: track.color }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="text-left font-mono text-[11px] font-bold"
            style={{ color: track.color }}
            title="クリックで名前変更"
          >
            {track.name}
          </button>
        )}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-slate-600">
            {track.blocks.length} blocks
          </span>
          <button
            type="button"
            onClick={() => onDelete(track.id)}
            className="font-mono text-[9px] text-slate-600 transition-colors hover:text-red-500"
          >
            × 削除
          </button>
        </div>
      </div>

      {/* canvas */}
      <div
        className="relative"
        style={{
          width: totalSlots * SLOT_PX,
          background: '#060c1a',
          cursor: 'cell',
        }}
        onClick={handleCanvasClick}
      >
        {/* grid columns every 5 slots */}
        {Array.from(
          { length: Math.floor(totalSlots / 5) + 1 },
          (_, i) => i * 5,
        ).map((t) => (
          <div
            key={t}
            className="pointer-events-none absolute top-0 h-full w-px bg-[#0f172a]"
            style={{ left: t * SLOT_PX }}
          />
        ))}

        {track.blocks.map((b) => {
          const active =
            playheadSlot >= b.slot && playheadSlot < b.slot + b.span;
          const past = playheadSlot >= b.slot + b.span;
          return (
            <BlockView
              key={b.id}
              block={b}
              trackId={track.id}
              active={active}
              past={past}
              selected={selectedBlockId === b.id}
              onSelect={onSelectBlock}
              onUpdate={onUpdateBlock}
              onDelete={onDeleteBlock}
            />
          );
        })}
      </div>
    </div>
  );
}
