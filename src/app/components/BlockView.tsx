import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BLOCK_META, type Block, type Subroutine } from '../types';
import type { BlockStatus } from '../engine';
import { BLOCK_MARGIN, BLOCK_W, SLOT_PX, TRACK_H, pxToSlot } from '../layout';

interface Props {
  block: Block;
  trackId: string;
  status: BlockStatus;
  selected: boolean;
  linkSource: boolean;
  draggable: boolean;
  /**
   * Legal slot range preserving L→R dep order. `min` is one past the
   * rightmost block this block depends on; `max` is one before the
   * leftmost block that depends on this one. `max` may be `Infinity`
   * for blocks with no dependents. Undefined means "no constraint".
   */
  slotBounds?: { min: number; max: number };
  subroutines: Subroutine[];
  onSelect: (trackId: string, blockId: string) => void;
  onUpdate: (trackId: string, blockId: string, patch: Partial<Block>) => void;
  onDelete: (trackId: string, blockId: string) => void;
}

interface Badge {
  key: string;
  icon: string;
  color: string;
  tooltip: string;
}

/** Live position of the drop-target ghost in viewport coordinates. */
interface GhostState {
  left: number;
  top: number;
}

/**
 * Derive visual badges for block attributes that deviate from defaults.
 * Default attributes get no badge so the timeline stays quiet.
 */
function computeBadges(block: Block): Badge[] {
  const badges: Badge[] = [];
  if (block.skipIfMissing) {
    badges.push({
      key: 'skip-if-missing',
      icon: '?',
      color: '#eab308',
      tooltip: 'ターゲットが見つからなくてもOK',
    });
  }
  if (typeof block.onError === 'object' && 'retry' in block.onError) {
    badges.push({
      key: 'retry',
      icon: `↻${block.onError.retry}`,
      color: '#60a5fa',
      tooltip: `${block.onError.retry}回リトライ`,
    });
  } else if (block.onError === 'skip') {
    badges.push({
      key: 'on-error-skip',
      icon: '→',
      color: '#a855f7',
      tooltip: 'エラーでもスキップ',
    });
  } else if (block.onError === 'ignore') {
    badges.push({
      key: 'on-error-ignore',
      icon: '∅',
      color: '#64748b',
      tooltip: 'エラーを無視',
    });
  }
  if (block.timeout !== undefined && block.timeout >= 60) {
    badges.push({
      key: 'timeout',
      icon: '⏱',
      color: '#06b6d4',
      tooltip: `タイムアウト ${block.timeout}s`,
    });
  }
  return badges;
}

/**
 * A single block rendered at its `slot` position. Dragging uses a
 * drag-then-commit pattern: the source stays in place (dimmed) while a
 * ghost rectangle previews the drop slot. The actual mutation only fires
 * on mouseup so other blocks don't thrash, and a synthesized click right
 * after the drag is swallowed so it doesn't accidentally open the "add
 * block" dialog on the track underneath.
 * Fixed width — span was removed (see docs/01-concept.md).
 */
export function BlockView({
  block,
  trackId,
  status,
  selected,
  linkSource,
  draggable,
  slotBounds,
  subroutines,
  onSelect,
  onUpdate,
  onDelete,
}: Props) {
  const meta = BLOCK_META[block.type];
  const [hov, setHov] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const subRef =
    block.type === 'subroutine' && block.subroutineId
      ? subroutines.find((s) => s.id === block.subroutineId)
      : undefined;
  const displayLabel =
    block.type === 'subroutine'
      ? subRef
        ? subRef.name
        : '(未割当)'
      : block.label;

  const left = block.slot * SLOT_PX + BLOCK_MARGIN;
  const width = BLOCK_W;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(trackId, block.id);
    if (!draggable) return; // link/sync mode: select only, no drag

    // The block is anchored to its current track: dragging only changes
    // the slot within this track. Cross-track moves tangled the DAG
    // edges and changed ownership semantics, so they were removed — use
    // cut/paste or re-add in the target track instead.
    const node = e.currentTarget as HTMLElement;
    const trackCanvas = node.closest<HTMLElement>(
      `[data-container-id="${trackId}"]`,
    );
    if (!trackCanvas) return; // defensive: nothing to drag relative to

    const startX = e.clientX;
    const startY = e.clientY;
    let didMove = false;
    let targetSlot = block.slot;

    const prevPointerEvents = node.style.pointerEvents;
    const beginDrag = () => {
      // Let clicks fall through the block to the canvas so the track
      // still receives mouseup under the cursor (keeps the click-swallow
      // logic predictable).
      node.style.pointerEvents = 'none';
      setDragging(true);
    };

    // Clamp the drop target to the block's legal slot range so a
    // drag can never invert a dep arrow. `min` comes from deps
    // (dep.slot + 1); `max` comes from dependents (dependent.slot - 1).
    // Absence = no constraint.
    const minSlot = slotBounds?.min ?? 0;
    const maxSlot = slotBounds?.max ?? Number.POSITIVE_INFINITY;

    const updateTarget = (ev: MouseEvent) => {
      const rect = trackCanvas.getBoundingClientRect();
      const raw = Math.max(0, pxToSlot(ev.clientX - rect.left));
      targetSlot = Math.min(Math.max(raw, minSlot), maxSlot);
      setGhost({
        left: rect.left + targetSlot * SLOT_PX + BLOCK_MARGIN,
        top: rect.top + 8,
      });
    };

    const onMove = (ev: MouseEvent) => {
      if (!didMove) {
        const dx = Math.abs(ev.clientX - startX);
        const dy = Math.abs(ev.clientY - startY);
        if (dx > 3 || dy > 3) {
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

      // Swallow the click that the browser synthesizes after the
      // mouseup. Without this the click bubbles to the track canvas'
      // onClick and opens the "add block" dialog at the drop slot.
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener('click', swallow, true);
      };
      window.addEventListener('click', swallow, true);
    };

    // Pressing Escape during a drag cancels without committing, so
    // accidental drags can be backed out cleanly.
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

  const badges = computeBadges(block);

  const isRunning = status === 'running';
  const isError = status === 'error';
  const isOk = status === 'ok';
  const isSkipped = status === 'skipped';
  const isCancelled = status === 'cancelled';
  const isFaded = isSkipped || isCancelled;

  // Execution state trumps selection/hover when it comes to coloring the
  // frame, since it's the most important signal while the scenario is
  // running.
  const borderColor = linkSource
    ? '#60a5fa'
    : isError
      ? '#ef4444'
      : isRunning
        ? meta.color
        : selected
          ? meta.color
          : isOk
            ? `${meta.color}44`
            : isFaded
              ? '#94a3b855'
              : `${meta.color}${hov ? 'cc' : '66'}`;

  const background = isError
    ? '#ef44441f'
    : isRunning
      ? `${meta.color}44`
      : isOk
        ? `${meta.color}10`
        : isFaded
          ? 'transparent'
          : hov
            ? `${meta.color}28`
            : `${meta.color}18`;

  const shadow = linkSource
    ? '0 0 12px #60a5fa88'
    : isError
      ? '0 0 18px #ef444488'
      : isRunning
        ? `0 0 18px ${meta.color}aa`
        : selected
          ? `0 0 0 1px ${meta.color}88`
          : 'none';

  const zIndex = linkSource
    ? 6
    : isRunning || isError
      ? 5
      : selected
        ? 4
        : 2;

  return (
    <>
      <div
        className="absolute select-none overflow-hidden rounded-lg px-2 transition-colors"
        style={{
          left,
          top: 8,
          width,
          height: TRACK_H - 16,
          cursor: draggable ? (dragging ? 'grabbing' : 'grab') : 'crosshair',
          opacity: dragging ? 0.35 : isFaded ? 0.5 : 1,
          background,
          border: `${linkSource ? 2 : isError || isRunning ? 2 : 1.5}px ${
            isSkipped || isCancelled ? 'dashed' : 'solid'
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
      >
        <div className="flex h-full flex-col justify-center gap-0.5 pr-1">
          <div
            className="font-mono text-[8px] font-bold tracking-wider"
            style={{ color: meta.color }}
          >
            {meta.icon} {meta.label.toUpperCase()}
          </div>
          <div
            className="truncate font-mono text-[11px]"
            style={{
              color: isFaded
                ? 'var(--fl-text-ghost)'
                : isError
                  ? '#ef4444'
                  : block.type === 'subroutine' && !subRef
                    ? '#f59e0b'
                    : isOk
                      ? 'var(--fl-text-faint)'
                      : 'var(--fl-text-muted)',
            }}
            title={displayLabel}
          >
            {displayLabel}
          </div>
        </div>

        {/* Execution status indicator — top-right corner, hidden on hover
            so the delete button stays usable. */}
        {!hov && (isRunning || isOk || isError || isSkipped) && (
          <span
            className="pointer-events-none absolute right-1 top-1 flex h-3 items-center justify-center rounded px-1 font-mono text-[8px] font-bold leading-none"
            style={{
              background: isError
                ? '#ef4444'
                : isRunning
                  ? meta.color
                  : isOk
                    ? `${meta.color}66`
                    : '#94a3b866',
              color: isError || isRunning ? '#fff' : 'var(--fl-text)',
            }}
            title={status}
          >
            {isRunning ? '●' : isOk ? '✓' : isError ? '✕' : '–'}
          </span>
        )}

        {badges.length > 0 && (
          <div className="pointer-events-none absolute left-1 bottom-1 flex gap-0.5">
            {badges.map((b) => (
              <span
                key={b.key}
                title={b.tooltip}
                className="pointer-events-auto flex h-3 items-center justify-center rounded px-0.5 font-mono text-[8px] font-bold leading-none"
                style={{ background: `${b.color}2a`, color: b.color }}
              >
                {b.icon}
              </span>
            ))}
          </div>
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
              height: TRACK_H - 16,
              background: `${meta.color}33`,
              border: `2px dashed ${meta.color}`,
              boxShadow: `0 0 14px ${meta.color}66, inset 0 0 10px ${meta.color}33`,
              zIndex: 10000,
            }}
          >
            <div
              className="flex h-full flex-col justify-center gap-0.5 px-2"
              style={{ color: meta.color }}
            >
              <div className="font-mono text-[8px] font-bold tracking-wider">
                {meta.icon} {meta.label.toUpperCase()}
              </div>
              <div className="truncate font-mono text-[11px] opacity-80">
                {displayLabel}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
