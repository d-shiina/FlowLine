import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Block, Track } from '../types';
import type { BlockStatus } from '../engine';
import { HEADER_W, SLOT_PX, pxToSlot } from '../layout';
import { computeTrackLayout } from '../trackLayout';
import { BlockView } from './BlockView';

interface Props {
  track: Track;
  totalSlots: number;
  blockStatus: Record<string, BlockStatus>;
  currentSlot: number | undefined;
  selectedBlockId: string | null;
  blocksDraggable: boolean;
  variant?: 'normal' | 'error';
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onUpdateBlock: (
    trackId: string,
    blockId: string,
    patch: Partial<Block>,
  ) => void;
  onDeleteBlock: (trackId: string, blockId: string) => void;
  onSelectBlock: (trackId: string, blockId: string) => void;
  onCanvasClick: (trackId: string, slot: number) => void;
  onDoubleClickBlock: (trackId: string, blockId: string) => void;
}

export function TrackRow({
  track,
  totalSlots,
  blockStatus,
  currentSlot,
  selectedBlockId,
  blocksDraggable,
  variant = 'normal',
  onRename,
  onDelete,
  onUpdateBlock,
  onDeleteBlock,
  onSelectBlock,
  onCanvasClick,
  onDoubleClickBlock,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(track.name);
  const isError = variant === 'error';

  const commitRename = () => {
    onRename(track.id, nameVal.trim() || track.name);
    setRenaming(false);
  };

  const { trackHeight } = useMemo(() => computeTrackLayout(track), [track]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const slot = pxToSlot(e.clientX - rect.left);
    onCanvasClick(track.id, slot);
  };

  return (
    <div
      className="flex border-b border-fl-border"
      style={{ height: trackHeight }}
    >
      {/* header */}
      <div
        className="flex flex-shrink-0 flex-col justify-between px-3 py-2"
        style={{
          width: HEADER_W,
          background: isError ? 'var(--fl-error-panel)' : 'var(--fl-panel)',
          borderRight: `${isError ? 4 : 3}px solid ${track.color}`,
        }}
      >
        {isError ? (
          <div
            className="flex items-center gap-1.5 font-mono text-[11px] font-bold"
            style={{ color: track.color }}
            title="エラー処理トラック"
          >
            <AlertTriangle className="h-3 w-3" />
            エラー処理
          </div>
        ) : renaming ? (
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
            className="w-full rounded border bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-fl-text outline-none"
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
          <span
            className="font-mono text-[9px]"
            style={{
              color: isError
                ? track.blocks.length === 0
                  ? '#f43f5e88'
                  : '#f43f5ecc'
                : 'var(--fl-text-faint)',
            }}
          >
            {isError && track.blocks.length === 0
              ? '空 = 即停止'
              : `${track.blocks.length} blocks`}
          </span>
          {!isError && (
            <button
              type="button"
              onClick={() => onDelete(track.id)}
              className="font-mono text-[9px] text-fl-text-faint transition-colors hover:text-red-500"
            >
              × 削除
            </button>
          )}
        </div>
      </div>

      {/* canvas */}
      <div
        data-container-id={track.id}
        className="relative"
        style={{
          width: totalSlots * SLOT_PX,
          background: isError ? 'var(--fl-error-canvas)' : 'var(--fl-bg)',
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
            className="pointer-events-none absolute top-0 h-full w-px"
            style={{
              left: t * SLOT_PX,
              background: isError ? '#f43f5e22' : 'var(--fl-border)',
            }}
          />
        ))}

        {/* empty hint for error handler */}
        {isError && track.blocks.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[10px] text-[#f43f5e88]">
            + エラー時のクリーンアップ・通知を配置（クリック）
          </div>
        )}

        {/* per-track playhead */}
        {currentSlot !== undefined && (
          <div
            className="pointer-events-none absolute top-0 h-full"
            style={{
              left: currentSlot * SLOT_PX,
              width: SLOT_PX,
              background: isError
                ? 'linear-gradient(180deg, transparent, #f43f5e22, transparent)'
                : 'linear-gradient(180deg, transparent, #22c55e22, transparent)',
              borderLeft: `1px solid ${isError ? '#f43f5e66' : '#22c55e66'}`,
              borderRight: `1px solid ${isError ? '#f43f5e66' : '#22c55e66'}`,
            }}
          />
        )}

        {track.blocks.map((b) => (
          <BlockView
            key={b.id}
            block={b}
            trackId={track.id}
            accentColor={track.color}
            status={blockStatus[b.id] ?? 'idle'}
            selected={selectedBlockId === b.id}
            draggable={blocksDraggable}
            trackHeight={trackHeight}
            onSelect={onSelectBlock}
            onUpdate={onUpdateBlock}
            onDelete={onDeleteBlock}
            onDoubleClick={onDoubleClickBlock}
          />
        ))}
      </div>
    </div>
  );
}
