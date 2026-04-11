import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BLOCK_META, type Block, type Subroutine } from '../types';
import { BLOCK_MARGIN, BLOCK_W, SLOT_PX, TRACK_H, pxToSlot } from '../layout';

interface Props {
  block: Block;
  trackId: string;
  active: boolean;
  past: boolean;
  selected: boolean;
  linkSource: boolean;
  draggable: boolean;
  subroutines: Subroutine[];
  onSelect: (trackId: string, blockId: string) => void;
  onUpdate: (trackId: string, blockId: string, patch: Partial<Block>) => void;
  onDelete: (trackId: string, blockId: string) => void;
  onMoveToContainer: (
    fromId: string,
    blockId: string,
    toId: string,
    newSlot: number,
  ) => void;
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
  active,
  past,
  selected,
  linkSource,
  draggable,
  subroutines,
  onSelect,
  onUpdate,
  onDelete,
  onMoveToContainer,
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

    const startX = e.clientX;
    const startY = e.clientY;
    let didMove = false;
    // The drag result. Mutated by mousemove, committed on mouseup.
    let targetTrackId = trackId;
    let targetSlot = block.slot;

    // Hit-test suppression only kicks in once a drag actually starts, so
    // plain click-to-select doesn't cause the click event to retarget
    // onto the track canvas underneath.
    const node = e.currentTarget as HTMLElement;
    const prevPointerEvents = node.style.pointerEvents;
    const beginDrag = () => {
      node.style.pointerEvents = 'none';
      setDragging(true);
    };

    const updateTarget = (ev: MouseEvent) => {
      const elem = document.elementFromPoint(ev.clientX, ev.clientY);
      const container = elem
        ? (elem as Element).closest<HTMLElement>('[data-container-id]')
        : null;

      if (container) {
        targetTrackId =
          container.getAttribute('data-container-id') || trackId;
        const rect = container.getBoundingClientRect();
        targetSlot = Math.max(0, pxToSlot(ev.clientX - rect.left));
        setGhost({
          left: rect.left + targetSlot * SLOT_PX + BLOCK_MARGIN,
          top: rect.top + 8,
        });
      } else {
        // Cursor is outside any track canvas. Hide the ghost rather than
        // snapping to a nonsense location — the user sees nothing will
        // be committed unless they return over a track.
        setGhost(null);
      }
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
        try {
          node.style.pointerEvents = prevPointerEvents;
        } catch {
          /* node may be detached after a cross-container move */
        }
        setDragging(false);
        setGhost(null);
      }
    };

    const onUp = () => {
      teardown();

      if (!didMove || cancelled) return;

      // Commit the move. For same-container we shortcut via updateBlock
      // so undo history records a single slot change; cross-container
      // goes through moveBlock so the scenario store handles the
      // transfer atomically.
      if (targetTrackId === trackId) {
        if (targetSlot !== block.slot) {
          onUpdate(trackId, block.id, { slot: targetSlot });
        }
      } else {
        onMoveToContainer(trackId, block.id, targetTrackId, targetSlot);
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

  const borderColor = linkSource
    ? '#60a5fa'
    : selected
      ? meta.color
      : active
        ? meta.color
        : past
          ? `${meta.color}30`
          : `${meta.color}${hov ? 'cc' : '66'}`;

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
          opacity: dragging ? 0.35 : 1,
          background: active
            ? `${meta.color}44`
            : past
              ? `${meta.color}0a`
              : hov
                ? `${meta.color}28`
                : `${meta.color}18`,
          border: `${linkSource ? 2 : 1.5}px solid ${borderColor}`,
          boxShadow: linkSource
            ? '0 0 12px #60a5fa88'
            : active
              ? `0 0 14px ${meta.color}66`
              : selected
                ? `0 0 0 1px ${meta.color}88`
                : 'none',
          zIndex: linkSource ? 6 : active ? 5 : selected ? 4 : 2,
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
              color: past
                ? 'var(--fl-text-ghost)'
                : block.type === 'subroutine' && !subRef
                  ? '#f59e0b'
                  : 'var(--fl-text-muted)',
            }}
            title={displayLabel}
          >
            {displayLabel}
          </div>
        </div>

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
