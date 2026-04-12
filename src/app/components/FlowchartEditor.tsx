import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { Block, Step, Subroutine } from '../types';
import type { BlockStatus } from '../engine';
import type { NodeManifestEntry } from '../../globals';
import { Breadcrumb } from './Breadcrumb';
import { AddStepModal } from './AddStepModal';
import { StepNode, type StepNodeData } from './StepNode';
import { uid } from '../useScenario';

interface Props {
  block: Block;
  trackName: string;
  trackColor: string;
  scenarioName: string;
  subroutines: Subroutine[];
  nodeManifest: NodeManifestEntry[];
  scenarioVariables: Record<string, unknown>;
  executionStatus: Record<string, BlockStatus>;
  running: boolean;
  onBack: () => void;
  onUpdateBlock: (patch: Partial<Block>) => void;
  onCreateVariable: (key: string, value: unknown) => void;
  onRunStep?: (stepId: string) => void;
  onRunFromStep?: (stepId: string) => void;
  onRunBlock?: () => void;
}

const NODE_WIDTH = 340;
const NODE_X_SPACING = 380;
const NODE_Y = 100;

const nodeTypes = { step: StepNode };

function reorderSteps(steps: Step[]): Step[] {
  const sorted = steps
    .filter((s) => !s.parentStepId)
    .sort((a, b) => a.order - b.order);
  const orderMap = new Map<string, number>();
  sorted.forEach((s, i) => orderMap.set(s.id, i));
  return steps.map((s) =>
    orderMap.has(s.id) ? { ...s, order: orderMap.get(s.id)! } : s,
  );
}

function FlowchartEditorInner({
  block,
  trackName,
  trackColor,
  scenarioName,
  subroutines,
  nodeManifest,
  scenarioVariables,
  executionStatus,
  running,
  onBack,
  onUpdateBlock,
  onRunStep,
}: Props) {
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [addStepParent, setAddStepParent] = useState<string | undefined>();

  // Node manifest lookup
  const manifestMap = useMemo(() => {
    const m = new Map<string, NodeManifestEntry>();
    for (const n of nodeManifest) m.set(n.id, n);
    return m;
  }, [nodeManifest]);

  // Callbacks passed to each node
  const handleUpdateStep = useCallback(
    (stepId: string, patch: Partial<Step>) => {
      onUpdateBlock({
        steps: block.steps.map((s) =>
          s.id === stepId ? { ...s, ...patch } : s,
        ),
      });
    },
    [block.steps, onUpdateBlock],
  );

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      onUpdateBlock({
        steps: reorderSteps(
          block.steps.filter(
            (s) => s.id !== stepId && s.parentStepId !== stepId,
          ),
        ),
      });
    },
    [block.steps, onUpdateBlock],
  );

  // Build ReactFlow nodes from block.steps
  const buildNodes = useCallback((): Node<StepNodeData>[] => {
    const topLevel = block.steps
      .filter((s) => !s.parentStepId)
      .sort((a, b) => a.order - b.order);
    return topLevel.map((step, i) => ({
      id: step.id,
      type: 'step',
      position: { x: i * NODE_X_SPACING, y: NODE_Y },
      dragHandle: '.drag-handle',
      data: {
        step,
        status: executionStatus[step.id] ?? 'idle',
        nodeManifest: step.nodeId ? manifestMap.get(step.nodeId) : undefined,
        scenarioVariables,
        onDelete: handleDeleteStep,
        onUpdate: handleUpdateStep,
        onRunStep: onRunStep && !running ? onRunStep : undefined,
      },
    }));
  }, [block.steps, executionStatus, manifestMap, scenarioVariables, handleDeleteStep, handleUpdateStep, onRunStep, running]);

  // Build edges (linear chain)
  const buildEdges = useCallback((): Edge[] => {
    const topLevel = block.steps
      .filter((s) => !s.parentStepId)
      .sort((a, b) => a.order - b.order);
    const edges: Edge[] = [];
    for (let i = 0; i < topLevel.length - 1; i++) {
      edges.push({
        id: `e-${topLevel[i].id}-${topLevel[i + 1].id}`,
        source: topLevel[i].id,
        target: topLevel[i + 1].id,
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      });
    }
    return edges;
  }, [block.steps]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StepNodeData>>(buildNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(buildEdges());

  // Rebuild when block.steps changes (external updates).
  useEffect(() => {
    setNodes(buildNodes());
    setEdges(buildEdges());
  }, [buildNodes, buildEdges, setNodes, setEdges]);

  // Handle node changes: only react to position changes for reorder.
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<StepNodeData>>[]) => {
      onNodesChange(changes);
      // Detect drag end: reorder based on new x positions
      const positionChanges = changes.filter(
        (c) => c.type === 'position' && !c.dragging,
      );
      if (positionChanges.length > 0) {
        // Sort nodes by x after drag
        const sorted = [...nodes]
          .map((n) => {
            const change = changes.find(
              (c) => c.type === 'position' && c.id === n.id,
            );
            if (change && change.type === 'position' && change.position) {
              return { ...n, position: change.position };
            }
            return n;
          })
          .sort((a, b) => a.position.x - b.position.x);

        // Update order field in steps
        const orderMap = new Map<string, number>();
        sorted.forEach((n, i) => orderMap.set(n.id, i));
        onUpdateBlock({
          steps: block.steps.map((s) =>
            orderMap.has(s.id) ? { ...s, order: orderMap.get(s.id)! } : s,
          ),
        });
      }
    },
    [onNodesChange, nodes, block.steps, onUpdateBlock],
  );

  const nextOrder =
    block.steps.length > 0
      ? Math.max(...block.steps.map((s) => s.order)) + 1
      : 0;

  const handleAddStep = (step: Step) => {
    onUpdateBlock({ steps: [...block.steps, step] });
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex-shrink-0 border-b border-fl-border bg-fl-panel">
        <Breadcrumb
          segments={[
            { label: scenarioName, onClick: onBack },
            { label: trackName, onClick: onBack },
            { label: block.label },
          ]}
        />
      </div>

      <div className="relative flex-1" style={{ background: 'var(--fl-bg)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 2 },
          }}
        >
          <Background color="var(--fl-border)" gap={24} size={1} />
          <Controls
            style={{
              background: 'var(--fl-panel)',
              border: '1px solid var(--fl-border)',
            }}
          />
          <MiniMap
            nodeColor={() => trackColor}
            style={{
              background: 'var(--fl-panel)',
              border: '1px solid var(--fl-border)',
            }}
            maskColor="rgba(0, 0, 0, 0.5)"
          />
        </ReactFlow>

        {/* Floating add button */}
        <button
          type="button"
          onClick={() => {
            setAddStepParent(undefined);
            setAddStepOpen(true);
          }}
          className="absolute bottom-4 right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#3b82f6] bg-fl-panel-2 font-mono text-[20px] text-[#3b82f6] shadow-lg transition-colors hover:bg-[#3b82f6] hover:text-white"
          title="ステップを追加"
        >
          +
        </button>

        {/* Track label badge */}
        <div
          className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-lg border border-fl-border bg-fl-panel px-3 py-1.5 font-mono text-[10px] font-bold shadow"
          style={{ color: trackColor }}
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: trackColor }}
          />
          {block.label}
        </div>
      </div>

      <AddStepModal
        open={addStepOpen}
        onOpenChange={setAddStepOpen}
        blockLabel={block.label}
        nextOrder={nextOrder}
        parentStepId={addStepParent}
        subroutines={subroutines}
        nodeManifest={nodeManifest}
        onAdd={handleAddStep}
      />
    </div>
  );
}

export function FlowchartEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowchartEditorInner {...props} />
    </ReactFlowProvider>
  );
}
