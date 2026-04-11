import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Block, Subroutine, Track } from '../types';
import { BLOCK_META } from '../types';
import type { BlockStatus } from '../engine';
import {
  BLOCK_MARGIN,
  HEADER_W,
  LANE_H,
  SLOT_PX,
  TRACK_H,
  pxToSlot,
} from '../layout';
import { BlockView } from './BlockView';

type Variant = 'normal' | 'error';

interface Props {
  track: Track;
  totalSlots: number;
  blockStatus: Record<string, BlockStatus>;
  /**
   * Per-block slot range that preserves dep ordering (arrows stay
   * left-to-right). Computed globally in App.tsx and passed through
   * so BlockView can clamp the drag target.
   */
  slotBounds: Record<string, { min: number; max: number }>;
  currentSlot: number | undefined;
  selectedBlockId: string | null;
  linkSourceBlockId: string | null;
  blocksDraggable: boolean;
  variant?: Variant;
  subroutines: Subroutine[];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onUpdateBlock: (
    trackId: string,
    blockId: string,
    patch: Partial<Block>,
  ) => void;
  onDeleteBlock: (trackId: string, blockId: string) => void;
  onSelectBlock: (trackId: string, blockId: string) => void;
  onCanvasClick: (
    trackId: string,
    slot: number,
    /** Container the click landed inside, if any. */
    parent?: { blockId: string; branch?: 'then' | 'else' },
  ) => void;
}

export function TrackRow({
  track,
  totalSlots,
  blockStatus,
  slotBounds,
  currentSlot,
  selectedBlockId,
  linkSourceBlockId,
  blocksDraggable,
  variant = 'normal',
  subroutines,
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

  // Compute container-frame rects for every loop / branch / switch
  // on this track. Each frame carries the list of "cases" (lane
  // labels) so the renderer can split the interior into vertical
  // lanes — branches get ['then','else'], switches get whatever
  // ``params.cases`` declares, loops have a single empty-string
  // lane.
  //
  // Empty containers still get a ghost frame so the drop zone is
  // visible. Sorted by fromSlot so overlapping frames layer
  // predictably (leftmost rendered first).
  const containerFrames = useMemo(() => {
    const frames: Array<{
      id: string;
      parentType: 'loop' | 'branch' | 'switch';
      label: string;
      color: string;
      fromSlot: number;
      toSlot: number;
      empty: boolean;
      /** Lane labels, top-to-bottom. Empty string = single lane. */
      cases: string[];
    }> = [];
    for (const parent of track.blocks) {
      if (
        parent.type !== 'loop' &&
        parent.type !== 'branch' &&
        parent.type !== 'switch'
      ) {
        continue;
      }
      const cases: string[] =
        parent.type === 'branch'
          ? ['then', 'else']
          : parent.type === 'switch'
            ? Array.isArray(
                (parent.params as Record<string, unknown> | undefined)?.cases,
              )
              ? (
                  (parent.params as { cases: unknown[] }).cases.map((c) =>
                    String(c),
                  )
                )
              : ['case_0']
            : [''];
      const children = track.blocks.filter(
        (b) => b.parentBlockId === parent.id,
      );
      let fromSlot: number;
      let toSlot: number;
      let empty = false;
      if (children.length === 0) {
        fromSlot = parent.slot;
        toSlot = parent.slot + 1;
        empty = true;
      } else {
        const childMin = Math.min(...children.map((c) => c.slot));
        const childMax = Math.max(...children.map((c) => c.slot));
        fromSlot = Math.min(parent.slot, childMin);
        toSlot = Math.max(parent.slot, childMax);
      }
      frames.push({
        id: parent.id,
        parentType: parent.type,
        label: parent.label,
        color: BLOCK_META[parent.type].color,
        fromSlot,
        toSlot,
        empty,
        cases,
      });
    }
    frames.sort((a, b) => a.fromSlot - b.fromSlot);
    return frames;
  }, [track.blocks]);

  // Row height grows to fit the widest lane stack on this track.
  // Two lanes fit inside TRACK_H natively; 3+ lanes add LANE_H
  // per extra lane so children render at a readable height.
  const maxLanes = useMemo(() => {
    let n = 1;
    for (const f of containerFrames) {
      if (f.cases.length > n) n = f.cases.length;
    }
    return n;
  }, [containerFrames]);
  const trackHeight = Math.max(TRACK_H, maxLanes * LANE_H + 16);

  // Per-block lane info keyed by block.id. Top-level blocks live
  // on lane -1 (full row). Children of a multi-case container get
  // (laneIndex, laneCount) so BlockView can offset + size itself.
  const blockLanes = useMemo(() => {
    const out: Record<
      string,
      { laneIndex: number; laneCount: number; color: string }
    > = {};
    for (const f of containerFrames) {
      if (f.cases.length <= 1) continue; // loops: full-height children
      for (const child of track.blocks) {
        if (child.parentBlockId !== f.id) continue;
        const label = child.parentBranch ?? f.cases[0];
        const idx = f.cases.indexOf(label);
        if (idx < 0) continue;
        out[child.id] = {
          laneIndex: idx,
          laneCount: f.cases.length,
          color: f.color,
        };
      }
    }
    return out;
  }, [containerFrames, track.blocks]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const slot = pxToSlot(e.clientX - rect.left);
    // If the click lands inside a container frame, pass the parent
    // info along so the new block auto-nests. With overlapping
    // frames, the last match (rendered on top) wins.
    const hits = containerFrames.filter(
      (f) => slot >= f.fromSlot && slot <= f.toSlot,
    );
    const parent = hits.length > 0 ? hits[hits.length - 1] : null;
    onCanvasClick(
      track.id,
      slot,
      parent ? { blockId: parent.id } : undefined,
    );
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

        {/* Container frames (loop / branch / switch scope
            visualisation). Rendered behind the blocks so they stay
            interactive. Multi-case containers draw horizontal
            dividers between lanes + a label per lane so the
            TRUE/FALSE or per-case boundaries are obvious. */}
        {containerFrames.map((f) => {
          const left = f.fromSlot * SLOT_PX + BLOCK_MARGIN / 2;
          const width =
            (f.toSlot - f.fromSlot + 1) * SLOT_PX - BLOCK_MARGIN;
          const borderAlpha = f.empty ? '44' : '88';
          const bgAlpha = f.empty ? '08' : '0f';
          const multiLane = f.cases.length > 1;
          const frameTop = 3;
          const frameBottom = 3;
          const frameHeight = trackHeight - frameTop - frameBottom;
          const laneHeight = multiLane
            ? frameHeight / f.cases.length
            : frameHeight;
          return (
            <div
              key={f.id}
              className="pointer-events-none absolute rounded-lg border-[1.5px] border-dashed"
              style={{
                left,
                width,
                top: frameTop,
                bottom: frameBottom,
                borderColor: `${f.color}${borderAlpha}`,
                background: `${f.color}${bgAlpha}`,
                zIndex: 0,
              }}
              title={
                f.empty
                  ? `${f.label} (空のボディ — ブロックをドロップして配置)`
                  : `${f.label} (内包ブロックをまとめて表示)`
              }
            >
              <div
                className="absolute top-0 flex items-center gap-1 rounded-br-md px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider"
                style={{
                  left: 0,
                  color: f.color,
                  background: `${f.color}22`,
                  opacity: f.empty ? 0.55 : 1,
                }}
              >
                {f.label}
              </div>
              {/* Lane dividers + per-lane labels */}
              {multiLane &&
                f.cases.map((caseLabel, i) => {
                  const top = i * laneHeight;
                  const isLast = i === f.cases.length - 1;
                  return (
                    <div
                      key={`${caseLabel}-${i}`}
                      className="absolute"
                      style={{
                        top,
                        left: 0,
                        right: 0,
                        height: laneHeight,
                        borderTop:
                          i === 0 ? 'none' : `1px dashed ${f.color}55`,
                      }}
                    >
                      <span
                        className="absolute right-1 font-mono text-[8px] font-bold uppercase tracking-wider"
                        style={{
                          top: isLast ? undefined : 1,
                          bottom: isLast ? 1 : undefined,
                          color: f.color,
                          opacity: 0.75,
                        }}
                      >
                        {caseLabel}
                      </span>
                    </div>
                  );
                })}
              {f.empty && (
                <div
                  className="absolute inset-0 flex items-center justify-center font-mono text-[9px]"
                  style={{ color: `${f.color}88` }}
                >
                  ここに内包ブロックをドロップ
                </div>
              )}
            </div>
          );
        })}

        {/* per-track playhead: column highlight on the block currently
            running, so the user can see where each parallel track is. */}
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
            status={blockStatus[b.id] ?? 'idle'}
            selected={selectedBlockId === b.id}
            linkSource={linkSourceBlockId === b.id}
            draggable={blocksDraggable}
            slotBounds={slotBounds[b.id]}
            containerFrames={containerFrames}
            lane={blockLanes[b.id]}
            trackHeight={trackHeight}
            subroutines={subroutines}
            onSelect={onSelectBlock}
            onUpdate={onUpdateBlock}
            onDelete={onDeleteBlock}
          />
        ))}
      </div>
    </div>
  );
}
