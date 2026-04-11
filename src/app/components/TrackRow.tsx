import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Block, Track } from '../types';
import { HEADER_W, SLOT_PX, TRACK_H, pxToSlot } from '../layout';
import { BlockView } from './BlockView';

type Variant = 'normal' | 'error';

interface Props {
  track: Track;
  totalSlots: number;
  playheadSlot: number;
  selectedBlockId: string | null;
  variant?: Variant;
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
}

export function TrackRow({
  track,
  totalSlots,
  playheadSlot,
  selectedBlockId,
  variant = 'normal',
  onRename,
  onDelete,
  onUpdateBlock,
  onDeleteBlock,
  onSelectBlock,
  onCanvasClick,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(track.name);
  const isError = variant === 'error';

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
        className="flex flex-shrink-0 flex-col justify-between px-3 py-2"
        style={{
          width: HEADER_W,
          background: isError ? '#18090d' : '#0a1020',
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
          <span
            className="font-mono text-[9px]"
            style={{
              color: isError
                ? track.blocks.length === 0
                  ? '#f43f5e88'
                  : '#f43f5ecc'
                : '#64748b',
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
              className="font-mono text-[9px] text-slate-600 transition-colors hover:text-red-500"
            >
              × 削除
            </button>
          )}
        </div>
      </div>

      {/* canvas */}
      <div
        className="relative"
        style={{
          width: totalSlots * SLOT_PX,
          background: isError ? '#0a0406' : '#060c1a',
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
              background: isError ? '#1a0609' : '#0f172a',
            }}
          />
        ))}

        {/* empty hint for error handler */}
        {isError && track.blocks.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[10px] text-[#f43f5e55]">
            + エラー時のクリーンアップ・通知を配置（クリック）
          </div>
        )}

        {track.blocks.map((b) => {
          const active = playheadSlot >= b.slot && playheadSlot < b.slot + 1;
          const past = playheadSlot >= b.slot + 1;
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
