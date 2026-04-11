import { useState } from 'react';
import { BLOCK_META, type Block } from '../types';
import { SLOT_PX, TRACK_H, pxToSlot } from '../layout';

interface Props {
  block: Block;
  trackId: string;
  active: boolean;
  past: boolean;
  selected: boolean;
  onSelect: (trackId: string, blockId: string) => void;
  onUpdate: (trackId: string, blockId: string, patch: Partial<Block>) => void;
  onDelete: (trackId: string, blockId: string) => void;
}

/**
 * A single block rendered on its track. Drag body to move, drag right edge
 * to resize (change span). Position is measured in slots, not seconds.
 */
export function BlockView({
  block,
  trackId,
  active,
  past,
  selected,
  onSelect,
  onUpdate,
  onDelete,
}: Props) {
  const meta = BLOCK_META[block.type];
  const [hov, setHov] = useState(false);

  const left = block.slot * SLOT_PX;
  const width = Math.max(block.span * SLOT_PX - 8, 56);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(trackId, block.id);
    const startX = e.clientX;
    const origSlot = block.slot;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const newSlot = Math.max(0, origSlot + pxToSlot(dx));
      if (newSlot !== block.slot) {
        onUpdate(trackId, block.id, { slot: newSlot });
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const origSpan = block.span;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const newSpan = Math.max(1, origSpan + pxToSlot(dx));
      if (newSpan !== block.span) {
        onUpdate(trackId, block.id, { span: newSpan });
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className="absolute cursor-grab select-none overflow-hidden rounded-lg px-2 transition-colors"
      style={{
        left,
        top: 8,
        width,
        height: TRACK_H - 16,
        background: active
          ? `${meta.color}44`
          : past
            ? `${meta.color}0a`
            : hov
              ? `${meta.color}28`
              : `${meta.color}18`,
        border: `1.5px solid ${
          selected
            ? meta.color
            : active
              ? meta.color
              : past
                ? `${meta.color}30`
                : `${meta.color}${hov ? 'cc' : '66'}`
        }`,
        boxShadow: active
          ? `0 0 14px ${meta.color}66`
          : selected
            ? `0 0 0 1px ${meta.color}88`
            : 'none',
        zIndex: active ? 5 : selected ? 4 : 2,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onMouseDown={handleDragStart}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(trackId, block.id);
      }}
    >
      <div className="flex h-full flex-col justify-center gap-0.5">
        <div
          className="font-mono text-[8px] font-bold tracking-wider"
          style={{ color: meta.color }}
        >
          {meta.icon} {meta.label.toUpperCase()}
        </div>
        <div
          className="truncate font-mono text-[11px]"
          style={{ color: past ? '#334155' : '#cbd5e1' }}
        >
          {block.label}
        </div>
        {width > 80 && (
          <div className="font-mono text-[8px]" style={{ color: `${meta.color}99` }}>
            span {block.span}
          </div>
        )}
      </div>

      {hov && (
        <button
          type="button"
          className="absolute right-3 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] text-white"
          onMouseDown={(e) => {
            e.stopPropagation();
            onDelete(trackId, block.id);
          }}
          aria-label="削除"
        >
          ×
        </button>
      )}

      <div
        className="absolute right-0 top-0 bottom-0 flex w-2 cursor-ew-resize items-center justify-center"
        onMouseDown={handleResizeStart}
      >
        {hov && (
          <div
            className="h-3 w-0.5 rounded-sm"
            style={{ background: `${meta.color}aa` }}
          />
        )}
      </div>
    </div>
  );
}
