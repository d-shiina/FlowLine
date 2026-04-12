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
import { StartNode, EndNode, type StartNodeData, type EndNodeData } from './StartEndNodes';
import { AddEdge, type AddEdgeData } from './AddEdge';
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

const X_SPACING = 380;
const NODE_Y = 100;
const START_ID = '__start__';
const END_ID = '__end__';

type AnyNodeData = StepNodeData | StartNodeData | EndNodeData;

const nodeTypes = {
  step: StepNode,
  start: StartNode,
  end: EndNode,
};

const edgeTypes = {
  add: AddEdge,
};

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
  const [insertIndex, setInsertIndex] = useState<number>(0);

  const manifestMap = useMemo(() => {
    const m = new Map<string, NodeManifestEntry>();
    for (const n of nodeManifest) m.set(n.id, n);
    return m;
  }, [nodeManifest]);

  // Step mutations
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

  // Block inputs mutations
  const handleAddInput = useCallback(
    (name: string, key: string) => {
      onUpdateBlock({ inputs: { ...block.inputs, [name]: key } });
    },
    [block.inputs, onUpdateBlock],
  );
  const handleUpdateInput = useCallback(
    (name: string, key: string) => {
      onUpdateBlock({ inputs: { ...block.inputs, [name]: key } });
    },
    [block.inputs, onUpdateBlock],
  );
  const handleRenameInput = useCallback(
    (oldName: string, newName: string) => {
      if (oldName === newName || !newName.trim()) return;
      const next = { ...block.inputs };
      next[newName] = next[oldName] ?? '';
      delete next[oldName];
      onUpdateBlock({ inputs: next });
    },
    [block.inputs, onUpdateBlock],
  );
  const handleDeleteInput = useCallback(
    (name: string) => {
      const next = { ...block.inputs };
      delete next[name];
      onUpdateBlock({ inputs: next });
    },
    [block.inputs, onUpdateBlock],
  );

  // Block outputs mutations
  const handleAddOutput = useCallback(
    (name: string, key: string) => {
      onUpdateBlock({ outputs: { ...block.outputs, [name]: key } });
    },
    [block.outputs, onUpdateBlock],
  );
  const handleUpdateOutput = useCallback(
    (name: string, key: string) => {
      onUpdateBlock({ outputs: { ...block.outputs, [name]: key } });
    },
    [block.outputs, onUpdateBlock],
  );
  const handleRenameOutput = useCallback(
    (oldName: string, newName: string) => {
      if (oldName === newName || !newName.trim()) return;
      const next = { ...block.outputs };
      next[newName] = next[oldName] ?? '';
      delete next[oldName];
      onUpdateBlock({ outputs: next });
    },
    [block.outputs, onUpdateBlock],
  );
  const handleDeleteOutput = useCallback(
    (name: string) => {
      const next = { ...block.outputs };
      delete next[name];
      onUpdateBlock({ outputs: next });
    },
    [block.outputs, onUpdateBlock],
  );

  const handleOpenAdd = useCallback((idx: number) => {
    setInsertIndex(idx);
    setAddStepOpen(true);
  }, []);

  // Build ReactFlow nodes: [Start, ...steps, End]
  const { rfNodes, rfEdges } = useMemo(() => {
    const topLevel = block.steps
      .filter((s) => !s.parentStepId)
      .sort((a, b) => a.order - b.order);

    const nodes: Node<AnyNodeData>[] = [];
    const edges: Edge[] = [];

    // Start node (locked position, not draggable)
    nodes.push({
      id: START_ID,
      type: 'start',
      position: { x: 0, y: NODE_Y },
      draggable: false,
      selectable: false,
      data: {
        inputs: block.inputs ?? {},
        scenarioVariables,
        onAddInput: handleAddInput,
        onUpdateInput: handleUpdateInput,
        onRenameInput: handleRenameInput,
        onDeleteInput: handleDeleteInput,
      } as StartNodeData,
    });

    // Step nodes
    topLevel.forEach((step, i) => {
      nodes.push({
        id: step.id,
        type: 'step',
        position: { x: (i + 1) * X_SPACING, y: NODE_Y },
        dragHandle: '.drag-handle',
        data: {
          step,
          status: executionStatus[step.id] ?? 'idle',
          nodeManifest: step.nodeId ? manifestMap.get(step.nodeId) : undefined,
          scenarioVariables,
          onDelete: handleDeleteStep,
          onUpdate: handleUpdateStep,
          onRunStep: onRunStep && !running ? onRunStep : undefined,
        } as StepNodeData,
      });
    });

    // End node
    nodes.push({
      id: END_ID,
      type: 'end',
      position: { x: (topLevel.length + 1) * X_SPACING, y: NODE_Y },
      draggable: false,
      selectable: false,
      data: {
        outputs: block.outputs ?? {},
        scenarioVariables,
        onAddOutput: handleAddOutput,
        onUpdateOutput: handleUpdateOutput,
        onRenameOutput: handleRenameOutput,
        onDeleteOutput: handleDeleteOutput,
      } as EndNodeData,
    });

    // Edges with inline + buttons
    // Build a list of [source, target] pairs: Start → step0 → step1 → ... → End
    const chain: string[] = [START_ID, ...topLevel.map((s) => s.id), END_ID];
    for (let i = 0; i < chain.length - 1; i++) {
      edges.push({
        id: `e-${chain[i]}-${chain[i + 1]}`,
        source: chain[i],
        target: chain[i + 1],
        type: 'add',
        data: { onAdd: () => handleOpenAdd(i) } as AddEdgeData,
      });
    }

    return { rfNodes: nodes, rfEdges: edges };
  }, [
    block.steps,
    block.inputs,
    block.outputs,
    executionStatus,
    manifestMap,
    scenarioVariables,
    handleDeleteStep,
    handleUpdateStep,
    handleAddInput,
    handleUpdateInput,
    handleRenameInput,
    handleDeleteInput,
    handleAddOutput,
    handleUpdateOutput,
    handleRenameOutput,
    handleDeleteOutput,
    handleOpenAdd,
    onRunStep,
    running,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AnyNodeData>>(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(rfEdges);

  // Sync rebuilt nodes/edges when block changes.
  useEffect(() => {
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [rfNodes, rfEdges, setNodes, setEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<AnyNodeData>>[]) => {
      // Filter out position changes for start/end (they're locked).
      const filtered = changes.filter((c) => {
        if (c.type === 'position' && (c.id === START_ID || c.id === END_ID)) {
          return false;
        }
        return true;
      });
      onNodesChange(filtered);

      // On drag end: reorder steps by x position.
      const dragEnd = filtered.find(
        (c) => c.type === 'position' && !c.dragging,
      );
      if (dragEnd) {
        const stepNodes = nodes.filter(
          (n) => n.id !== START_ID && n.id !== END_ID,
        );
        const updated = stepNodes.map((n) => {
          const ch = filtered.find(
            (c) => c.type === 'position' && c.id === n.id,
          );
          if (ch && ch.type === 'position' && ch.position) {
            return { ...n, position: ch.position };
          }
          return n;
        });
        updated.sort((a, b) => a.position.x - b.position.x);
        const orderMap = new Map<string, number>();
        updated.forEach((n, i) => orderMap.set(n.id, i));
        onUpdateBlock({
          steps: block.steps.map((s) =>
            orderMap.has(s.id) ? { ...s, order: orderMap.get(s.id)! } : s,
          ),
        });
      }
    },
    [onNodesChange, nodes, block.steps, onUpdateBlock],
  );

  const handleAddStep = (step: Step) => {
    // Insert at insertIndex (0 = before first step, N = after last step).
    const topLevel = block.steps
      .filter((s) => !s.parentStepId)
      .sort((a, b) => a.order - b.order);
    const others = block.steps.filter((s) => s.parentStepId);
    const newStep = { ...step, order: insertIndex };
    const newFlow = [
      ...topLevel.slice(0, insertIndex),
      newStep,
      ...topLevel.slice(insertIndex),
    ].map((s, i) => ({ ...s, order: i }));
    onUpdateBlock({ steps: [...newFlow, ...others] });
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
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--fl-border)" gap={24} size={1} />
          <Controls
            style={{
              background: 'var(--fl-panel)',
              border: '1px solid var(--fl-border)',
            }}
          />
          <MiniMap
            nodeColor={(n) => {
              if (n.id === START_ID) return '#22c55e';
              if (n.id === END_ID) return '#f43f5e';
              return trackColor;
            }}
            style={{
              background: 'var(--fl-panel)',
              border: '1px solid var(--fl-border)',
            }}
            maskColor="rgba(0, 0, 0, 0.5)"
          />
        </ReactFlow>

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
        nextOrder={insertIndex}
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
