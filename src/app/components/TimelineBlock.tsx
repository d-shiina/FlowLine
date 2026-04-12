import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import type { Block } from '../types';
import type { BlockStatus } from '../engine';

interface Props {
  block: Block;
  trackColor: string;
  status: BlockStatus;
  selected: boolean;
  slotW: number;
  trackH: number;
  onSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onSlotChange: (newSlot: number) => void;
}

/**
 * Single block card on the timeline. Absolute-positioned within its
 * track canvas using `block.slot * slotW`. Drag to reposition —
 * snaps to slot grid on release.
 */
export function TimelineBlock({
  block,
  trackColor,
  status,
  selected,
  slotW,
  trackH,
  onSelect,
  onOpen,
  onDelete,
  onSlotChange,
}: Props) {
  const [hov, setHov] = useState(false);
  const [dragSlot, setDragSlot] = useState<number | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    originSlot: number;
    moved: boolean;
  } | null>(null);

  const isRunning = status === 'running';
  const isError = status === 'error';
  const isOk = status === 'ok';
  const isSkipped = status === 'skipped' || status === 'cancelled';

  const accent = trackColor;
  const borderColor = isError
    ? '#ef4444'
    : isRunning
      ? accent
      : selected
        ? accent
        : isOk
          ? `${accent}55`
          : isSkipped
            ? '#94a3b855'
            : hov
              ? `${accent}aa`
              : `${accent}66`;
  const background = isError
    ? '#ef44441f'
    : isRunning
      ? `${accent}33`
      : isOk
        ? `${accent}18`
        : isSkipped
          ? 'transparent'
          : hov
            ? `${accent}26`
            : `${accent}18`;
  const shadow = isError
    ? '0 0 14px #ef444488'
    : isRunning
      ? `0 0 14px ${accent}aa`
      : selected
        ? `0 0 0 1px ${accent}88`
        : 'none';

  const effectiveSlot = dragSlot ?? block.slot;
  const left = effectiveSlot * slotW + 6;
  const width = slotW - 12;
  const top = 8;
  const height = trackH - 16;

  const stepCount = block.steps?.length ?? 0;
  const hasInputs = block.inputs && Object.keys(block.inputs).length > 0;
  const hasOutputs = block.outputs && Object.keys(block.outputs).length > 0;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    dragStateRef.current = {
      startX: e.clientX,
      originSlot: block.slot,
      moved: false,
    };

    const onMove = (ev: MouseEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      const dx = ev.clientX - st.startX;
      if (!st.moved && Math.abs(dx) < 4) return;
      st.moved = true;
      const slotDelta = Math.round(dx / slotW);
      const newSlot = Math.max(0, st.originSlot + slotDelta);
      setDragSlot(newSlot);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const st = dragStateRef.current;
      dragStateRef.current = null;
      if (st?.moved && dragSlot !== null && dragSlot !== block.slot) {
        onSlotChange(dragSlot);
      }
      setDragSlot(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className="group absolute cursor-grab select-none overflow-hidden rounded-md transition-[background,box-shadow,border-color] active:cursor-grabbing"
      style={{
        left,
        top,
        width,
        height,
        border: `1.5px ${isSkipped ? 'dashed' : 'solid'} ${borderColor}`,
        background,
        boxShadow: shadow,
        opacity: isSkipped ? 0.5 : 1,
        zIndex: selected || isRunning ? 10 : dragSlot !== null ? 20 : 1,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={`${block.label} (slot ${block.slot})`}
    >
      {/* Left color bar */}
      <div
        className="absolute bottom-0 left-0 top-0 w-0.5"
        style={{ background: accent }}
      />

      <div className="flex h-full flex-col justify-center gap-0.5 pl-2 pr-1.5">
        <div
          className="font-mono text-[8px] font-bold tracking-wider"
          style={{ color: accent }}
        >
          ▶ TASK
        </div>
        <div
          className="truncate font-mono text-[10px]"
          style={{
            color: isSkipped
              ? 'var(--fl-text-ghost)'
              : isError
                ? '#ef4444'
                : isOk
                  ? 'var(--fl-text-faint)'
                  : 'var(--fl-text-muted)',
          }}
        >
          {block.label}
        </div>
      </div>

      {/* In/out indicator dots */}
      {hasInputs && (
        <span
          className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: accent, border: '1px solid var(--fl-panel-2)' }}
          title="inputs"
        />
      )}
      {hasOutputs && (
        <span
          className="absolute right-0 top-1/2 h-1.5 w-1.5 translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: accent, border: '1px solid var(--fl-panel-2)' }}
          title="outputs"
        />
      )}

      {/* Step count badge */}
      {stepCount > 0 && !isRunning && !isOk && !isError && !isSkipped && (
        <span
          className="pointer-events-none absolute bottom-0.5 right-1 font-mono text-[7px] font-bold"
          style={{ color: `${accent}99` }}
        >
          {stepCount}s
        </span>
      )}

      {/* Status indicator */}
      {(isRunning || isOk || isError || isSkipped) && (
        <span
          className="pointer-events-none absolute right-1 top-1 flex h-2.5 items-center justify-center rounded px-0.5 font-mono text-[7px] font-bold leading-none"
          style={{
            background: isError
              ? '#ef4444'
              : isRunning
                ? accent
                : isOk
                  ? `${accent}66`
                  : '#94a3b866',
            color: isError || isRunning ? '#fff' : 'var(--fl-text)',
          }}
        >
          {isRunning ? '●' : isOk ? '✓' : isError ? '✕' : '–'}
        </span>
      )}

      {/* Delete button on hover */}
      <button
        type="button"
        className="absolute right-0.5 top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500/80 text-[8px] text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="削除"
      >
        <X className="h-2 w-2" />
      </button>
    </div>
  );
}
