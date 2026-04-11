import { useState } from 'react';
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
}

interface Badge {
  key: string;
  icon: string;
  color: string;
  tooltip: string;
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
 * A single block rendered at its `slot` position. Drag body to change slot;
 * collisions are resolved by the scenario store (shift-right chain).
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
}: Props) {
  const meta = BLOCK_META[block.type];
  const [hov, setHov] = useState(false);
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
    <div
      className="absolute select-none overflow-hidden rounded-lg px-2 transition-colors"
      style={{
        left,
        top: 8,
        width,
        height: TRACK_H - 16,
        cursor: draggable ? 'grab' : 'crosshair',
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
              ? '#334155'
              : block.type === 'subroutine' && !subRef
                ? '#f59e0b'
                : '#cbd5e1',
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

      {hov && (
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
  );
}
