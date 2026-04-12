import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Block } from '../types';
import type { BlockStatus } from '../engine';
import { BLOCK_MARGIN, BLOCK_W, SLOT_PX, pxToSlot } from '../layout';

interface Props {
  block: Block;
  trackId: string;
  accentColor: string;
  status: BlockStatus;
  selected: boolean;
  draggable: boolean;
  trackHeight: number;
  onSelect: (trackId: string, blockId: string) => void;
  onUpdate: (trackId: string, blockId: string, patch: Partial<Block>) => void;
  onDelete: (trackId: string, blockId: string) => void;
  onDoubleClick: (trackId: string, blockId: string) => void;
}

/** Live position + size of the drop-target ghost in viewport coordinates. */
interface GhostState {
  left: number;
  top: number;
  height: number;
}

/**
 * A single task block rendered at its `slot` position on the timeline.
 * All execution logic lives inside block.steps — the card is a pure
 * task container with no type-based visual differentiation.
 */
export function BlockView({
  block,
  trackId,
  accentColor,
  status,
  selected,
  draggable,
  trackHeight,
  onSelect,
  onUpdate,
  onDelete,
  onDoubleClick,
}: Props) {
  const [hov, setHov] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ghost, setGhost] = useState<GhostState | null>(null);

  const left = block.slot * SLOT_PX + BLOCK_MARGIN;
  const width = BLOCK_W;
  const blockTop = 8;
  const blockH = trackHeight - 16;

  const isRunning = status === 'running';
  const isError = status === 'error';
  const isOk = status === 'ok';
  const isSkipped = status === 'skipped';
  const isCancelled = status === 'cancelled';
  const isFaded = isSkipped || isCancelled;

  const borderColor = isError
    ? '#ef4444'
    : isRunning
      ? accentColor
      : selected
        ? accentColor
        : isOk
          ? `${accentColor}44`
          : isFaded
            ? '#94a3b855'
            : `${accentColor}${hov ? 'cc' : '66'}`;

  const background = isError
    ? '#ef44441f'
    : isRunning
      ? `${accentColor}44`
      : isOk
        ? `${accentColor}10`
        : isFaded
          ? 'transparent'
          : hov
            ? `${accentColor}28`
            : `${accentColor}18`;

  const shadow = isError
    ? '0 0 18px #ef444488'
    : isRunning
      ? `0 0 18px ${accentColor}aa`
      : selected
        ? `0 0 0 1px ${accentColor}88`
        : 'none';

  const zIndex = isRunning || isError ? 5 : selected ? 4 : 2;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(trackId, block.id);
    if (!draggable) return;

    const node = e.currentTarget as HTMLElement;
    const trackCanvas = node.closest<HTMLElement>(
      `[data-container-id="${trackId}"]`,
    );
    if (!trackCanvas) return;

    const startX = e.clientX;
    let didMove = false;
    let targetSlot = block.slot;

    const prevPointerEvents = node.style.pointerEvents;
    const beginDrag = () => {
      node.style.pointerEvents = 'none';
      setDragging(true);
    };

    const updateTarget = (ev: MouseEvent) => {
      const rect = trackCanvas.getBoundingClientRect();
      const raw = Math.max(0, pxToSlot(ev.clientX - rect.left));
      targetSlot = raw;
      setGhost({
        left: rect.left + targetSlot * SLOT_PX + BLOCK_MARGIN,
        top: rect.top + blockTop,
        height: blockH,
      });
    };

    const onMove = (ev: MouseEvent) => {
      if (!didMove) {
        const dx = Math.abs(ev.clientX - startX);
        if (dx > 3) {
          didMove = true;
          beginDrag();
        }
      }
      if (didMove) updateTarget(ev);
    };

    let cancelled = false;

    const teardown = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      if (didMove) {
        node.style.pointerEvents = prevPointerEvents;
        setDragging(false);
        setGhost(null);
      }
    };

    const onUp = () => {
      teardown();
      if (!didMove || cancelled) return;
      if (targetSlot !== block.slot) {
        onUpdate(trackId, block.id, { slot: targetSlot });
      }
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener('click', swallow, true);
      };
      window.addEventListener('click', swallow, true);
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && didMove) {
        ev.preventDefault();
        cancelled = true;
        teardown();
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
  };

  return (
    <>
      <div
        className="absolute select-none overflow-hidden rounded-lg px-2 transition-colors"
        style={{
          left,
          top: blockTop,
          width,
          height: blockH,
          cursor: draggable ? (dragging ? 'grabbing' : 'grab') : 'crosshair',
          opacity: dragging ? 0.35 : isFaded ? 0.5 : 1,
          background,
          border: `${isError || isRunning ? 2 : 1.5}px ${
            isFaded ? 'dashed' : 'solid'
          } ${borderColor}`,
          boxShadow: shadow,
          zIndex,
        }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(trackId, block.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick(trackId, block.id);
        }}
      >
        <div className="flex h-full flex-col justify-center gap-0.5 pr-1">
          <div
            className="font-mono text-[8px] font-bold tracking-wider"
            style={{ color: accentColor }}
          >
            ▶ TASK
          </div>
          <div
            className="truncate font-mono text-[11px]"
            style={{
              color: isFaded
                ? 'var(--fl-text-ghost)'
                : isError
                  ? '#ef4444'
                  : isOk
                    ? 'var(--fl-text-faint)'
                    : 'var(--fl-text-muted)',
            }}
            title={block.label}
          >
            {block.label}
          </div>
        </div>

        {/* Step count badge */}
        {!hov && block.steps.length > 0 && !isRunning && !isOk && !isError && !isFaded && (
          <span
            className="pointer-events-none absolute right-1 bottom-1 font-mono text-[8px] font-bold"
            style={{ color: `${accentColor}88` }}
          >
            {block.steps.length}s
          </span>
        )}

        {/* Execution status indicator */}
        {!hov && (isRunning || isOk || isError || isSkipped) && (
          <span
            className="pointer-events-none absolute right-1 top-1 flex h-3 items-center justify-center rounded px-1 font-mono text-[8px] font-bold leading-none"
            style={{
              background: isError
                ? '#ef4444'
                : isRunning
                  ? accentColor
                  : isOk
                    ? `${accentColor}66`
                    : '#94a3b866',
              color: isError || isRunning ? '#fff' : 'var(--fl-text)',
            }}
            title={status}
          >
            {isRunning ? '●' : isOk ? '✓' : isError ? '✕' : '–'}
          </span>
        )}

        {hov && !dragging && (
          <button
            type="button"
            className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] text-white"
            onMouseDown={(e) => {
              e.stopPropagation();
              onDelete(trackId, block.id);
            }}
            aria-label="削除"
          >
            ×
          </button>
        )}
      </div>

      {ghost &&
        createPortal(
          <div
            className="pointer-events-none fixed rounded-lg"
            style={{
              left: ghost.left,
              top: ghost.top,
              width: BLOCK_W,
              height: ghost.height,
              background: `${accentColor}33`,
              border: `2px dashed ${accentColor}`,
              boxShadow: `0 0 14px ${accentColor}66, inset 0 0 10px ${accentColor}33`,
              zIndex: 10000,
            }}
          >
            <div
              className="flex h-full flex-col justify-center gap-0.5 px-2"
              style={{ color: accentColor }}
            >
              <div className="font-mono text-[8px] font-bold tracking-wider">
                ▶ TASK
              </div>
              <div className="truncate font-mono text-[11px] opacity-80">
                {block.label}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
