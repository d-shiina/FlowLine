import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Block, Subroutine, Track } from '../types';
import { BLOCK_META } from '../types';
import type { BlockStatus } from '../engine';
import { summarizeExpression } from '../engine/jsonLogic';
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
  /**
   * Drag the container frame header left/right by an integer
   * slot delta. The store's moveBlockTree cascades the shift to
   * every descendant so the whole container slides as one.
   */
  onMoveContainerTree: (
    trackId: string,
    rootBlockId: string,
    delta: number,
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
  onMoveContainerTree,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(track.name);
  const isError = variant === 'error';

  const commitRename = () => {
    onRename(track.id, nameVal.trim() || track.name);
    setRenaming(false);
  };

  // Compute container-frame rects for every loop / branch / switch
  // on this track. Flow-control blocks are rendered AS these
  // frames (not as standalone BlockViews), so each frame carries
  // enough metadata for the renderer to draw a Blender-node-style
  // header + lane split + status coloring + click handler.
  //
  // Empty containers still get a minimum 1-slot frame so the drop
  // zone is visible. Sorted by fromSlot so overlapping frames
  // layer predictably (leftmost rendered first).
  const containerFrames = useMemo(() => {
    interface FrameInfo {
      block: Block;
      parentType: 'loop' | 'branch' | 'switch';
      label: string;
      color: string;
      fromSlot: number;
      toSlot: number;
      empty: boolean;
      cases: string[];
      /** Short summary line shown on the header (e.g. `× 3`, `case ...`). */
      summary: string;
    }
    const frames: FrameInfo[] = [];
    for (const parent of track.blocks) {
      if (
        parent.type !== 'loop' &&
        parent.type !== 'branch' &&
        parent.type !== 'switch'
      ) {
        continue;
      }
      const rawParams =
        (parent.params as Record<string, unknown> | undefined) ?? {};
      const cases: string[] =
        parent.type === 'branch'
          ? ['then', 'else']
          : parent.type === 'switch'
            ? Array.isArray(rawParams.cases)
              ? (rawParams.cases as unknown[]).map((c) => String(c))
              : ['case_0']
            : [''];
      const children = track.blocks.filter(
        (b) => b.parentBlockId === parent.id,
      );
      let fromSlot: number;
      let toSlot: number;
      let empty = false;
      if (children.length === 0) {
        // 1-slot wide so the header anchor sits exactly at the
        // container's own column. Growing to 2 slots used to leave
        // an empty first cell when the user added the first child,
        // because the click-to-add hit slot+1 instead of slot.
        fromSlot = parent.slot;
        toSlot = parent.slot;
        empty = true;
      } else {
        const childMin = Math.min(...children.map((c) => c.slot));
        const childMax = Math.max(...children.map((c) => c.slot));
        fromSlot = Math.min(parent.slot, childMin);
        toSlot = Math.max(parent.slot, childMax);
      }

      // A tiny one-line description rendered on the header's right
      // edge so the user can tell loops with different iteration
      // counts apart without opening the Inspector. Branches show
      // a compact form of their condition; switches show their
      // case count; loops show iteration count or `while` marker.
      let summary = '';
      if (parent.type === 'loop') {
        if (rawParams.whileCondition !== undefined) {
          const s = summarizeExpression(rawParams.whileCondition);
          summary = s ? `while ${s}` : 'while';
        } else if (typeof rawParams.iterations === 'number') {
          summary = `× ${rawParams.iterations}`;
        }
      } else if (parent.type === 'branch') {
        const s = summarizeExpression(rawParams.condition);
        if (s) summary = s;
      } else if (parent.type === 'switch') {
        const s = summarizeExpression(rawParams.expression);
        summary = s ? `${s} → ${cases.length}` : `${cases.length} cases`;
      }
      // Hard-cap the summary so a very long condition doesn't
      // overflow the header bar. The Inspector shows the full
      // expression when the user wants to inspect it.
      if (summary.length > 32) summary = summary.slice(0, 30) + '…';

      frames.push({
        block: parent,
        parentType: parent.type,
        label: parent.label,
        color: BLOCK_META[parent.type].color,
        fromSlot,
        toSlot,
        empty,
        cases,
        summary,
      });
    }
    frames.sort((a, b) => a.fromSlot - b.fromSlot);
    return frames;
  }, [track.blocks]);

  // Row height grows to fit the widest lane stack on this track.
  // Each container card carries a 16 px header plus `laneCount`
  // lanes of minimum LANE_H. TRACK_H (72 px) is the baseline for
  // tracks with no multi-lane container, giving a single ~56 px
  // block slot plus padding.
  const FRAME_HEADER_H = 16;
  const maxLanes = useMemo(() => {
    let n = 1;
    for (const f of containerFrames) {
      if (f.cases.length > n) n = f.cases.length;
    }
    return n;
  }, [containerFrames]);
  const trackHeight = Math.max(
    TRACK_H,
    FRAME_HEADER_H + maxLanes * LANE_H + 16,
  );

  // Per-block lane info keyed by block.id. Top-level blocks are
  // absent (the full row is theirs). Children of ANY container —
  // including single-lane loops — get an entry so BlockView knows
  // to position below the container's header strip. Branches and
  // switches add laneIndex > 0 for the non-first lane.
  const blockLanes = useMemo(() => {
    const out: Record<
      string,
      { laneIndex: number; laneCount: number; color: string }
    > = {};
    for (const f of containerFrames) {
      for (const child of track.blocks) {
        if (child.parentBlockId !== f.block.id) continue;
        if (f.cases.length <= 1) {
          out[child.id] = { laneIndex: 0, laneCount: 1, color: f.color };
          continue;
        }
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
      parent ? { blockId: parent.block.id } : undefined,
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

        {/* Container cards — loop / branch / switch rendered as
            Blender-node-style panels. The header strip at the top
            carries the icon + label + a tiny summary and is click-
            selectable so the Inspector still works. The body below
            is split into horizontal case lanes with per-lane labels
            pinned to the right edge.
            See docs/03-nodes.md (rev2). */}
        {containerFrames.map((f) => {
          const left = f.fromSlot * SLOT_PX + BLOCK_MARGIN / 2;
          const width =
            (f.toSlot - f.fromSlot + 1) * SLOT_PX - BLOCK_MARGIN;
          const status = blockStatus[f.block.id] ?? 'idle';
          const selected = selectedBlockId === f.block.id;
          const running = status === 'running';
          const failed = status === 'error';
          const skipped = status === 'skipped' || status === 'cancelled';

          const borderColor = failed
            ? '#ef4444'
            : selected || running
              ? f.color
              : `${f.color}${f.empty ? '55' : '88'}`;
          const bgColor = failed
            ? '#ef44440c'
            : `${f.color}${f.empty ? '0a' : '12'}`;
          const shadow = running
            ? `0 0 14px ${f.color}66`
            : failed
              ? '0 0 14px #ef444466'
              : selected
                ? `0 0 0 1px ${f.color}aa`
                : 'none';

          const multiLane = f.cases.length > 1;
          const frameTop = 3;
          const frameBottom = 3;
          const headerH = 16;
          const frameHeight = trackHeight - frameTop - frameBottom;
          const bodyTop = headerH;
          const bodyHeight = frameHeight - headerH;
          const laneHeight = multiLane
            ? bodyHeight / f.cases.length
            : bodyHeight;
          return (
            <div
              key={f.block.id}
              role="button"
              tabIndex={0}
              className="pointer-events-auto absolute cursor-grab overflow-hidden rounded-lg border-[1.5px] active:cursor-grabbing"
              style={{
                left,
                width,
                top: frameTop,
                bottom: frameBottom,
                borderColor,
                background: bgColor,
                boxShadow: shadow,
                borderStyle: skipped ? 'dashed' : 'solid',
                opacity: skipped ? 0.55 : 1,
                zIndex: 0,
              }}
              title={
                f.empty
                  ? `${f.label} (空のボディ — ブロックをドロップして配置)`
                  : f.label
              }
              onMouseDown={(e) => {
                // The whole frame is the selection + drag target.
                // stopPropagation keeps the click from bubbling to
                // the track canvas (which would otherwise open the
                // AddBlockModal for a brand-new top-level block).
                e.stopPropagation();
                e.preventDefault();
                onSelectBlock(track.id, f.block.id);
                if (!blocksDraggable) return;

                const startX = e.clientX;
                let didMove = false;
                let delta = 0;
                const onMove = (ev: MouseEvent) => {
                  const raw = Math.round((ev.clientX - startX) / SLOT_PX);
                  if (raw === delta) return;
                  delta = raw;
                  didMove = didMove || raw !== 0;
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                  if (didMove && delta !== 0) {
                    onMoveContainerTree(track.id, f.block.id, delta);
                  }
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
              // Swallow click events too — React synthesises a
              // click after mousedown/mouseup and without this it
              // still bubbles to the canvas onClick handler.
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header bar (visual only — the whole frame
                  catches mousedown, no per-element handler). */}
              <div
                className="pointer-events-none absolute left-0 right-0 top-0 flex items-center gap-1 px-1.5 text-left"
                style={{
                  height: headerH,
                  background: `${f.color}${selected || running ? '3a' : '22'}`,
                  borderBottom: `1px solid ${f.color}55`,
                }}
              >
                <span
                  className="font-mono text-[9px] font-bold tracking-wider"
                  style={{ color: f.color }}
                >
                  {BLOCK_META[f.parentType].icon} {f.label}
                </span>
                {f.summary && (
                  <span
                    className="ml-auto font-mono text-[8px] font-bold"
                    style={{ color: `${f.color}cc` }}
                  >
                    {f.summary}
                  </span>
                )}
                {running && (
                  <span
                    className="ml-1 flex h-2 w-2 animate-pulse rounded-full"
                    style={{ background: f.color }}
                    title="実行中"
                  />
                )}
              </div>

              {/* Lane dividers + per-lane labels */}
              {multiLane &&
                f.cases.map((caseLabel, i) => {
                  const top = bodyTop + i * laneHeight;
                  return (
                    <div
                      key={`${caseLabel}-${i}`}
                      className="pointer-events-none absolute"
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
                        className="absolute right-1 top-0.5 font-mono text-[8px] font-bold uppercase tracking-wider"
                        style={{
                          color: f.color,
                          opacity: 0.7,
                        }}
                      >
                        {caseLabel}
                      </span>
                    </div>
                  );
                })}

              {f.empty && (
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[9px]"
                  style={{
                    color: `${f.color}88`,
                    paddingTop: headerH,
                  }}
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

        {track.blocks.map((b) => {
          // Flow-control blocks render AS their container frame via
          // the `containerFrames` loop above — skip the standalone
          // BlockView so we don't draw two labels for the same
          // thing.
          if (
            b.type === 'loop' ||
            b.type === 'branch' ||
            b.type === 'switch'
          ) {
            return null;
          }
          return (
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
          );
        })}
      </div>
    </div>
  );
}
