import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import type { Block, BlockInputBinding, Scenario } from '../types';
import type { BlockStatus } from '../engine';
import { TimelineBlock } from './TimelineBlock';
import { ConnectionLayer, type DragLine } from './ConnectionLayer';

// ── Layout constants ────────────────────────
const SLOT_W = 150;
const TRACK_H = 80;
const RULER_H = 32;
const LEFT_W = 168;
const ERROR_SEPARATOR_H = 24;
const ADD_TRACK_H = 28;
const MIN_SLOTS = 20;

interface Props {
  scenario: Scenario;
  blockStatus: Record<string, BlockStatus>;
  selectedBlockId: string | null;
  running: boolean;
  currentSlotByTrack: Record<string, number | undefined>;
  scenarioVariables: Record<string, unknown>;
  onSelectBlock: (trackId: string, blockId: string) => void;
  onOpenBlock: (trackId: string, blockId: string) => void;
  onUpdateBlock: (trackId: string, blockId: string, patch: Partial<Block>) => void;
  onDeleteBlock: (trackId: string, blockId: string) => void;
  onCanvasClick: (trackId: string, slot: number) => void;
  onAddTrack: () => void;
  onRenameTrack: (trackId: string, name: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onDeleteSyncPoint: (id: string) => void;
}

/**
 * CSS Grid-based timeline with sticky track headers and ruler.
 *
 * Layout:
 * ┌──────┬─────────────────────┐
 * │corner│   ruler (sticky-top)│
 * ├──────┼─────────────────────┤
 * │track1│   track1 canvas     │
 * ├──────┼─────────────────────┤
 * │track2│   track2 canvas     │
 * ├──────┼─────────────────────┤
 * │+track│                     │
 * ├══════╪═════════════════════┤
 * │⚠err  │   error handler     │
 * └──────┴─────────────────────┘
 */
export function Timeline({
  scenario,
  blockStatus,
  selectedBlockId,
  currentSlotByTrack,
  scenarioVariables,
  onSelectBlock,
  onOpenBlock,
  onUpdateBlock,
  onDeleteBlock,
  onCanvasClick,
  onAddTrack,
  onRenameTrack,
  onDeleteTrack,
  onDeleteSyncPoint,
}: Props) {
  // Compute total slots
  const totalSlots = useMemo(() => {
    let m = MIN_SLOTS;
    for (const t of scenario.tracks) {
      for (const b of t.blocks) m = Math.max(m, b.slot + 3);
    }
    for (const b of scenario.errorHandler.blocks) {
      m = Math.max(m, b.slot + 3);
    }
    for (const sp of scenario.syncPoints) {
      m = Math.max(m, sp.slot + 2);
    }
    return m;
  }, [scenario]);

  const canvasW = totalSlots * SLOT_W;

  // Connection layer: track total inner height for SVG sizing.
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [innerSize, setInnerSize] = useState({ w: 0, h: 0 });
  const [dragLine, setDragLine] = useState<DragLine | null>(null);

  // Recompute inner size when content changes via ResizeObserver.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const update = () => setInnerSize({ w: el.scrollWidth, h: el.scrollHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scenario]);

  // Find all blocks for connection lookups.
  const findBlock = useCallback(
    (blockId: string): Block | null => {
      for (const t of scenario.tracks) {
        const b = t.blocks.find((x) => x.id === blockId);
        if (b) return b;
      }
      return scenario.errorHandler.blocks.find((x) => x.id === blockId) ?? null;
    },
    [scenario],
  );

  const findBlockTrackId = useCallback(
    (blockId: string): string | null => {
      for (const t of scenario.tracks) {
        if (t.blocks.some((x) => x.id === blockId)) return t.id;
      }
      if (scenario.errorHandler.blocks.some((x) => x.id === blockId)) {
        return scenario.errorHandler.id;
      }
      return null;
    },
    [scenario],
  );

  // Mousedown on a port dot: start a connection drag.
  const handleContainerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const portEl = target.closest<HTMLElement>('[data-port-id]');
      if (!portEl) return;
      const startSide = portEl.dataset.portSide;
      const startBlockId = portEl.dataset.portBlock!;
      const startPortName = portEl.dataset.portName!;
      // Connections are out → in.
      // If user starts on an in-port, treat as a "delete/replace" target?
      // For now: only allow start from out-port.
      if (startSide !== 'out') return;
      e.stopPropagation();
      e.preventDefault();

      const container = containerRef.current!;
      const containerRect = container.getBoundingClientRect();
      const startRect = portEl.getBoundingClientRect();
      const startX =
        startRect.left -
        containerRect.left +
        container.scrollLeft +
        startRect.width / 2;
      const startY =
        startRect.top -
        containerRect.top +
        container.scrollTop +
        startRect.height / 2;

      setDragLine({ x1: startX, y1: startY, x2: startX, y2: startY });

      const onMove = (ev: MouseEvent) => {
        const x =
          ev.clientX - containerRect.left + container.scrollLeft;
        const y = ev.clientY - containerRect.top + container.scrollTop;
        setDragLine({ x1: startX, y1: startY, x2: x, y2: y });
      };

      const onUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setDragLine(null);
        // Hit-test for an in-port at the drop location.
        const dropEl = document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest<HTMLElement>('[data-port-id]');
        if (!dropEl) return;
        if (dropEl.dataset.portSide !== 'in') return;
        const targetBlockId = dropEl.dataset.portBlock!;
        const targetPortName = dropEl.dataset.portName!;
        // Don't connect to self.
        if (targetBlockId === startBlockId) return;
        // Update target block's input binding to a connection.
        const targetBlock = findBlock(targetBlockId);
        const trackId = findBlockTrackId(targetBlockId);
        if (!targetBlock || !trackId) return;
        const newBinding: BlockInputBinding = {
          kind: 'connection',
          fromBlockId: startBlockId,
          fromPort: startPortName,
        };
        onUpdateBlock(trackId, targetBlockId, {
          inputs: { ...targetBlock.inputs, [targetPortName]: newBinding },
        });
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [findBlock, findBlockTrackId, onUpdateBlock],
  );

  const handleDeleteConnection = useCallback(
    (
      _fromBlockId: string,
      _fromPort: string,
      toBlockId: string,
      toPort: string,
    ) => {
      const targetBlock = findBlock(toBlockId);
      const trackId = findBlockTrackId(toBlockId);
      if (!targetBlock || !trackId || !targetBlock.inputs) return;
      const next = { ...targetBlock.inputs };
      delete next[toPort];
      onUpdateBlock(trackId, toBlockId, { inputs: next });
    },
    [findBlock, findBlockTrackId, onUpdateBlock],
  );

  return (
    <div
      ref={containerRef}
      className="fl-scroll relative h-full w-full overflow-auto bg-fl-bg"
      onMouseDown={handleContainerMouseDown}
    >
      <div
        ref={innerRef}
        className="grid"
        style={{
          gridTemplateColumns: `${LEFT_W}px ${canvasW}px`,
        }}
      >
        {/* ── Corner cell ── */}
        <div
          className="sticky left-0 top-0 z-[30] border-b border-r border-fl-border bg-fl-panel"
          style={{ height: RULER_H }}
        />

        {/* ── Ruler ── */}
        <div
          className="sticky top-0 z-[20] flex border-b border-fl-border bg-fl-panel"
          style={{ height: RULER_H }}
        >
          {Array.from({ length: totalSlots }, (_, i) => (
            <div
              key={i}
              className="flex items-center justify-center border-r border-fl-border/40 font-mono text-[9px] text-fl-text-ghost"
              style={{ width: SLOT_W }}
            >
              {i}
            </div>
          ))}
        </div>

        {/* ── Track rows ── */}
        {scenario.tracks.map((track) => {
          const currentSlot = currentSlotByTrack[track.id];
          return (
            <Fragment key={track.id}>
              <TrackHeader
                name={track.name}
                color={track.color}
                onRename={(name) => onRenameTrack(track.id, name)}
                onDelete={() => onDeleteTrack(track.id)}
              />
              <TrackCanvas
                totalSlots={totalSlots}
                color={track.color}
                currentSlot={currentSlot}
                onClick={(slot) => onCanvasClick(track.id, slot)}
              >
                {track.blocks.map((block) => (
                  <TimelineBlock
                    key={block.id}
                    block={block}
                    trackColor={track.color}
                    status={blockStatus[block.id] ?? 'idle'}
                    selected={selectedBlockId === block.id}
                    slotW={SLOT_W}
                    trackH={TRACK_H}
                    scenarioVariables={scenarioVariables}
                    onSelect={() => onSelectBlock(track.id, block.id)}
                    onOpen={() => onOpenBlock(track.id, block.id)}
                    onDelete={() => onDeleteBlock(track.id, block.id)}
                    onSlotChange={(newSlot) =>
                      onUpdateBlock(track.id, block.id, { slot: newSlot })
                    }
                    onUpdateInputs={(inputs) =>
                      onUpdateBlock(track.id, block.id, { inputs })
                    }
                    onUpdateOutputs={(outputs) =>
                      onUpdateBlock(track.id, block.id, { outputs })
                    }
                  />
                ))}
                {/* Sync point vertical bars */}
                {scenario.syncPoints.map((sp) => (
                  <div
                    key={sp.id}
                    className="pointer-events-none absolute top-0 h-full w-0"
                    style={{
                      left: sp.slot * SLOT_W + SLOT_W / 2,
                      borderLeft: '2px dashed #f43f5e88',
                    }}
                  />
                ))}
              </TrackCanvas>
            </Fragment>
          );
        })}

        {/* ── Add track row ── */}
        <div
          className="sticky left-0 z-[10] flex items-center justify-center border-b border-r border-fl-border bg-fl-panel"
          style={{ height: ADD_TRACK_H }}
        >
          <button
            type="button"
            onClick={onAddTrack}
            className="flex items-center gap-1 font-mono text-[9px] text-fl-text-ghost transition-colors hover:text-[#3b82f6]"
          >
            <Plus className="h-2.5 w-2.5" /> トラック追加
          </button>
        </div>
        <div
          className="border-b border-fl-border bg-fl-bg"
          style={{ height: ADD_TRACK_H }}
        />

        {/* ── Error handler separator ── */}
        <div
          className="sticky left-0 z-[10] flex items-center gap-1 border-b border-r border-[#f43f5e44] bg-[#f43f5e14] px-3"
          style={{ height: ERROR_SEPARATOR_H }}
        >
          <AlertTriangle className="h-2.5 w-2.5 text-[#f43f5e]" />
          <span className="font-mono text-[8px] font-bold tracking-wider text-[#f43f5e]">
            ERROR HANDLER
          </span>
        </div>
        <div
          className="flex items-center border-b border-[#f43f5e44] bg-[#f43f5e14] px-3"
          style={{ height: ERROR_SEPARATOR_H }}
        >
          <span className="font-mono text-[8px] text-[#f43f5e99]">
            abort 発火時のみ実行されるクリーンアップトラック
          </span>
        </div>

        {/* ── Error handler track ── */}
        <TrackHeader
          name={scenario.errorHandler.name}
          color="#f43f5e"
          isErrorHandler
        />
        <TrackCanvas
          totalSlots={totalSlots}
          color="#f43f5e"
          isErrorHandler
          currentSlot={currentSlotByTrack[scenario.errorHandler.id]}
          onClick={(slot) => onCanvasClick(scenario.errorHandler.id, slot)}
        >
          {scenario.errorHandler.blocks.map((block) => (
            <TimelineBlock
              key={block.id}
              block={block}
              trackColor="#f43f5e"
              status={blockStatus[block.id] ?? 'idle'}
              selected={selectedBlockId === block.id}
              slotW={SLOT_W}
              trackH={TRACK_H}
              scenarioVariables={scenarioVariables}
              onSelect={() => onSelectBlock(scenario.errorHandler.id, block.id)}
              onOpen={() =>
                onOpenBlock(scenario.errorHandler.id, block.id)
              }
              onDelete={() =>
                onDeleteBlock(scenario.errorHandler.id, block.id)
              }
              onSlotChange={(newSlot) =>
                onUpdateBlock(scenario.errorHandler.id, block.id, {
                  slot: newSlot,
                })
              }
              onUpdateInputs={(inputs) =>
                onUpdateBlock(scenario.errorHandler.id, block.id, { inputs })
              }
              onUpdateOutputs={(outputs) =>
                onUpdateBlock(scenario.errorHandler.id, block.id, { outputs })
              }
            />
          ))}
        </TrackCanvas>
      </div>

      {/* Connection overlay (SVG bezier paths between block ports) */}
      <ConnectionLayer
        scenario={scenario}
        containerRef={containerRef}
        width={innerSize.w || canvasW + LEFT_W}
        height={innerSize.h || 600}
        dragLine={dragLine}
        onDeleteConnection={handleDeleteConnection}
      />

      {/* Sync point labels floating over the ruler */}
      {scenario.syncPoints.map((sp) => (
        <div
          key={sp.id}
          className="group absolute z-[25]"
          style={{
            top: 6,
            left: LEFT_W + sp.slot * SLOT_W + SLOT_W / 2,
            transform: 'translateX(-50%)',
          }}
        >
          <button
            type="button"
            onClick={() => onDeleteSyncPoint(sp.id)}
            className="flex items-center gap-1 rounded border border-[#f43f5e66] bg-fl-panel px-1 py-px font-mono text-[8px] font-bold text-[#f43f5e] shadow transition-colors hover:border-[#f43f5e] hover:bg-[#f43f5e22]"
            title={`${sp.label} #${sp.slot} (クリックで削除)`}
          >
            ‖ {sp.label}
            <Trash2 className="h-2 w-2 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Track header (sticky left) ──────────────

function TrackHeader({
  name,
  color,
  isErrorHandler,
  onRename,
  onDelete,
}: {
  name: string;
  color: string;
  isErrorHandler?: boolean;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className="group sticky left-0 z-[10] flex items-center gap-2 border-b border-r border-fl-border bg-fl-panel px-3"
      style={{
        height: TRACK_H,
        borderLeftWidth: 4,
        borderLeftStyle: 'solid',
        borderLeftColor: color,
        background: isErrorHandler ? '#f43f5e0c' : 'var(--fl-panel)',
      }}
    >
      <span
        className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
        style={{ background: color }}
      />
      {isErrorHandler ? (
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-bold text-[#f43f5e]">
          ⚠ {name}
        </span>
      ) : (
        <input
          defaultValue={name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== name && onRename) onRename(v);
            else e.target.value = name;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="min-w-0 flex-1 truncate bg-transparent font-mono text-[10px] font-bold text-fl-text-muted outline-none focus:text-fl-text"
        />
      )}
      {!isErrorHandler && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="flex-shrink-0 text-fl-text-ghost opacity-0 transition-all group-hover:opacity-100 hover:text-red-500"
          title="トラック削除"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── Track canvas (right side) ────────────────

function TrackCanvas({
  totalSlots,
  color,
  currentSlot,
  isErrorHandler,
  onClick,
  children,
}: {
  totalSlots: number;
  color: string;
  currentSlot: number | undefined;
  isErrorHandler?: boolean;
  onClick: (slot: number) => void;
  children: React.ReactNode;
}) {
  const handleClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const slot = Math.floor((e.clientX - rect.left) / SLOT_W);
    onClick(slot);
  };

  return (
    <div
      className="relative border-b border-fl-border"
      style={{
        height: TRACK_H,
        background: isErrorHandler ? '#f43f5e08' : `${color}08`,
      }}
      onClick={handleClick}
    >
      {/* Vertical slot grid lines */}
      {Array.from({ length: totalSlots + 1 }, (_, i) => (
        <div
          key={i}
          className="pointer-events-none absolute bottom-0 top-0 w-px"
          style={{
            left: i * SLOT_W,
            background: i % 5 === 0 ? 'var(--fl-border)' : 'var(--fl-border-2)',
          }}
        />
      ))}
      {/* Playhead */}
      {currentSlot !== undefined && (
        <div
          className="pointer-events-none absolute top-0 h-full w-0.5"
          style={{
            left: currentSlot * SLOT_W + SLOT_W / 2,
            background: isErrorHandler ? '#f43f5e' : '#22c55e',
            boxShadow: `0 0 8px ${isErrorHandler ? '#f43f5eaa' : '#22c55eaa'}`,
          }}
        />
      )}
      {children}
    </div>
  );
}
