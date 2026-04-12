import { useCallback, useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Block, Scenario, Track } from '../types';
import type { BlockStatus } from '../engine';
import {
  TimelineBlockNode,
  type TimelineBlockNodeData,
} from './TimelineBlockNode';
import { SyncBarrierNode, type SyncBarrierNodeData } from './SyncBarrierNode';

// ── Layout constants ────────────────────────

const SLOT_PX = 120;
const TRACK_H = 80;
const TRACK_GAP = 12;
const TRACKS_START_Y = 40;
const ERROR_HANDLER_GAP = 32;

// Node types
const nodeTypes = {
  block: TimelineBlockNode,
  syncBarrier: SyncBarrierNode,
};

interface Props {
  scenario: Scenario;
  blockStatus: Record<string, BlockStatus>;
  selectedBlockId: string | null;
  onSelectBlock: (trackId: string, blockId: string) => void;
  onOpenBlock: (trackId: string, blockId: string) => void;
  onUpdateBlock: (trackId: string, blockId: string, patch: Partial<Block>) => void;
  onDeleteBlock: (trackId: string, blockId: string) => void;
  onDeleteSyncPoint: (syncId: string) => void;
  running: boolean;
}

type AnyData = TimelineBlockNodeData | SyncBarrierNodeData;

function TimelineInner({
  scenario,
  blockStatus,
  selectedBlockId,
  onSelectBlock,
  onOpenBlock,
  onUpdateBlock,
  onDeleteBlock,
  onDeleteSyncPoint,
}: Props) {
  // Compute track layout: trackIndex → y position
  const trackLayout = useMemo(() => {
    const layout: Array<{
      trackId: string;
      trackName: string;
      trackColor: string;
      y: number;
      height: number;
      isErrorHandler: boolean;
    }> = [];
    let y = TRACKS_START_Y;
    for (const t of scenario.tracks) {
      layout.push({
        trackId: t.id,
        trackName: t.name,
        trackColor: t.color,
        y,
        height: TRACK_H,
        isErrorHandler: false,
      });
      y += TRACK_H + TRACK_GAP;
    }
    // Error handler after a gap
    y += ERROR_HANDLER_GAP;
    layout.push({
      trackId: scenario.errorHandler.id,
      trackName: scenario.errorHandler.name,
      trackColor: scenario.errorHandler.color,
      y,
      height: TRACK_H,
      isErrorHandler: true,
    });
    return layout;
  }, [scenario.tracks, scenario.errorHandler]);

  const trackTopById = useMemo(() => {
    const m = new Map<string, { y: number; color: string; name: string; isErrorHandler: boolean }>();
    for (const t of trackLayout) {
      m.set(t.trackId, {
        y: t.y,
        color: t.trackColor,
        name: t.trackName,
        isErrorHandler: t.isErrorHandler,
      });
    }
    return m;
  }, [trackLayout]);

  // Compute total width based on max slot
  const totalSlots = useMemo(() => {
    let max = 12;
    for (const t of scenario.tracks) {
      for (const b of t.blocks) max = Math.max(max, b.slot + 2);
    }
    for (const b of scenario.errorHandler.blocks) max = Math.max(max, b.slot + 2);
    return max;
  }, [scenario.tracks, scenario.errorHandler.blocks]);

  // Build ReactFlow nodes
  const { rfNodes, rfEdges } = useMemo(() => {
    const nodes: Node<AnyData>[] = [];
    const edges: Edge[] = [];

    // Block nodes
    const renderBlocks = (blocks: Block[], trackId: string) => {
      const info = trackTopById.get(trackId);
      if (!info) return;
      for (const block of blocks) {
        nodes.push({
          id: block.id,
          type: 'block',
          position: { x: block.slot * SLOT_PX + 18, y: info.y + 12 },
          data: {
            block,
            trackColor: info.color,
            status: blockStatus[block.id] ?? 'idle',
            isErrorHandler: info.isErrorHandler,
            onDoubleClick: (id) => onOpenBlock(trackId, id),
            onDelete: (id) => onDeleteBlock(trackId, id),
          } as TimelineBlockNodeData,
          selected: selectedBlockId === block.id,
        });
      }
    };
    for (const t of scenario.tracks) renderBlocks(t.blocks, t.id);
    renderBlocks(scenario.errorHandler.blocks, scenario.errorHandler.id);

    // Sync barrier nodes — span regular tracks only
    const regularTracksHeight =
      scenario.tracks.length * (TRACK_H + TRACK_GAP);
    for (const sp of scenario.syncPoints) {
      nodes.push({
        id: sp.id,
        type: 'syncBarrier',
        position: {
          x: sp.slot * SLOT_PX,
          y: TRACKS_START_Y,
        },
        draggable: false,
        selectable: false,
        data: {
          label: sp.label,
          slot: sp.slot,
          height: regularTracksHeight,
          trackStates: scenario.tracks.map((t) => ({
            trackId: t.id,
            trackName: t.name,
            trackColor: t.color,
            state: 'pending' as const,
          })),
          onDelete: () => onDeleteSyncPoint(sp.id),
        } as SyncBarrierNodeData,
      });
    }

    // Edges: block output → block input (when name matches scenario variable key)
    const allBlocks: Array<[Track | { id: string; blocks: Block[] }, Block]> = [];
    for (const t of scenario.tracks) {
      for (const b of t.blocks) allBlocks.push([t as Track, b]);
    }
    // Build a map from scenario variable key → emitting block
    const emittersByKey = new Map<string, string>();
    for (const [, b] of allBlocks) {
      if (b.outputs) {
        for (const key of Object.values(b.outputs)) {
          emittersByKey.set(key, b.id);
        }
      }
    }
    // For each block's inputs, if key matches an emitter, draw an edge
    for (const [, b] of allBlocks) {
      if (b.inputs) {
        for (const [, key] of Object.entries(b.inputs)) {
          const emitterId = emittersByKey.get(key);
          if (emitterId && emitterId !== b.id) {
            edges.push({
              id: `e-${emitterId}-${b.id}`,
              source: emitterId,
              target: b.id,
              animated: true,
              style: { stroke: '#3b82f6', strokeWidth: 1.5 },
              label: key,
              labelStyle: { fontSize: 9, fill: 'var(--fl-text-faint)' },
              labelBgStyle: { fill: 'var(--fl-panel-2)' },
            });
          }
        }
      }
    }

    return { rfNodes: nodes, rfEdges: edges };
  }, [
    scenario.tracks,
    scenario.errorHandler,
    scenario.syncPoints,
    blockStatus,
    selectedBlockId,
    trackTopById,
    onOpenBlock,
    onDeleteBlock,
    onDeleteSyncPoint,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AnyData>>(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(rfEdges);

  useEffect(() => {
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [rfNodes, rfEdges, setNodes, setEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<AnyData>>[]) => {
      // Snap block drags to slot grid; lock Y to original track
      const snapped = changes.map((c) => {
        if (c.type !== 'position' || !c.position) return c;
        const node = nodes.find((n) => n.id === c.id);
        if (!node || node.type !== 'block') return c;
        // Find which track this block belongs to
        const blockData = node.data as TimelineBlockNodeData;
        if (!blockData?.block) return c;
        // Find original track y
        let trackY = node.position.y;
        for (const t of scenario.tracks) {
          if (t.blocks.some((b) => b.id === c.id)) {
            const info = trackTopById.get(t.id);
            if (info) trackY = info.y + 12;
            break;
          }
        }
        if (scenario.errorHandler.blocks.some((b) => b.id === c.id)) {
          const info = trackTopById.get(scenario.errorHandler.id);
          if (info) trackY = info.y + 12;
        }
        // Snap x to slot
        const snappedSlot = Math.max(0, Math.round((c.position.x - 18) / SLOT_PX));
        return {
          ...c,
          position: { x: snappedSlot * SLOT_PX + 18, y: trackY },
        };
      });
      onNodesChange(snapped);

      // On drag end, update the block's slot
      const dragEnd = snapped.find((c) => c.type === 'position' && !c.dragging);
      if (dragEnd && dragEnd.type === 'position' && dragEnd.position) {
        const newSlot = Math.max(0, Math.round((dragEnd.position.x - 18) / SLOT_PX));
        // Find which track the block is in
        for (const t of scenario.tracks) {
          const block = t.blocks.find((b) => b.id === dragEnd.id);
          if (block && block.slot !== newSlot) {
            onUpdateBlock(t.id, block.id, { slot: newSlot });
            return;
          }
        }
        const errBlock = scenario.errorHandler.blocks.find((b) => b.id === dragEnd.id);
        if (errBlock && errBlock.slot !== newSlot) {
          onUpdateBlock(scenario.errorHandler.id, errBlock.id, { slot: newSlot });
        }
      }
    },
    [onNodesChange, nodes, scenario, trackTopById, onUpdateBlock],
  );

  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (node.type !== 'block') return;
      // Find track
      for (const t of scenario.tracks) {
        if (t.blocks.some((b) => b.id === node.id)) {
          onSelectBlock(t.id, node.id);
          return;
        }
      }
      if (scenario.errorHandler.blocks.some((b) => b.id === node.id)) {
        onSelectBlock(scenario.errorHandler.id, node.id);
      }
    },
    [scenario, onSelectBlock],
  );

  return (
    <div className="relative h-full w-full" style={{ background: 'var(--fl-bg)' }}>
      {/* Track lane backgrounds (absolute, non-interactive) */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {trackLayout.map((t) => (
          <TrackLane
            key={t.trackId}
            y={t.y}
            height={t.height}
            color={t.trackColor}
            name={t.trackName}
            totalWidth={totalSlots * SLOT_PX}
            isErrorHandler={t.isErrorHandler}
          />
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        panOnDrag
        selectNodesOnDrag={false}
      >
        <Background color="var(--fl-border)" gap={SLOT_PX / 4} size={1} />
        <Controls
          style={{
            background: 'var(--fl-panel)',
            border: '1px solid var(--fl-border)',
          }}
        />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'syncBarrier') return '#f43f5e';
            const d = n.data as TimelineBlockNodeData;
            return d?.trackColor ?? '#3b82f6';
          }}
          style={{
            background: 'var(--fl-panel)',
            border: '1px solid var(--fl-border)',
          }}
          maskColor="rgba(0, 0, 0, 0.5)"
        />
      </ReactFlow>
    </div>
  );
}

function TrackLane({
  y,
  height,
  color,
  name,
  totalWidth,
  isErrorHandler,
}: {
  y: number;
  height: number;
  color: string;
  name: string;
  totalWidth: number;
  isErrorHandler: boolean;
}) {
  return (
    <>
      {/* Lane background */}
      <div
        className="absolute rounded-md"
        style={{
          left: 0,
          top: y,
          width: totalWidth + 80,
          height,
          background: isErrorHandler ? '#f43f5e0a' : `${color}0a`,
          border: `1px dashed ${isErrorHandler ? '#f43f5e33' : `${color}33`}`,
        }}
      />
      {/* Track name */}
      <div
        className="absolute flex items-center gap-1.5 rounded-md border bg-fl-panel px-2 py-0.5 font-mono text-[9px] font-bold shadow"
        style={{
          left: 8,
          top: y - 10,
          color: isErrorHandler ? '#f43f5e' : color,
          borderColor: isErrorHandler ? '#f43f5e44' : `${color}44`,
        }}
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: isErrorHandler ? '#f43f5e' : color }}
        />
        {isErrorHandler ? '⚠ ' + name : name}
      </div>
    </>
  );
}

export function Timeline(props: Props) {
  return (
    <ReactFlowProvider>
      <TimelineInner {...props} />
    </ReactFlowProvider>
  );
}
