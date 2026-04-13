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
import type { Block, BlockInputBinding, Step, Subroutine } from '../types';
import type { BlockStatus } from '../engine';
import type { NodeManifestEntry } from '../../globals';
import { Breadcrumb } from './Breadcrumb';
import { AddStepModal } from './AddStepModal';
import { StepNode, type StepNodeData } from './StepNode';
import { ContainerNode, type ContainerNodeData } from './ContainerNode';
import { StartNode, EndNode, type StartNodeData, type EndNodeData } from './StartEndNodes';
import { AddEdge, type AddEdgeData } from './AddEdge';
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

const START_ID = '__start__';
const END_ID = '__end__';

type AnyNodeData = StepNodeData | StartNodeData | EndNodeData | ContainerNodeData;

const nodeTypes = {
  step: StepNode,
  container: ContainerNode,
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
  const [addStepParent, setAddStepParent] = useState<string | undefined>(undefined);
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

  // Block inputs mutations — wrap raw scenario keys in { kind: 'var' } bindings.
  const handleAddInput = useCallback(
    (name: string, key: string) => {
      const binding: BlockInputBinding = { kind: 'var', key };
      onUpdateBlock({ inputs: { ...block.inputs, [name]: binding } });
    },
    [block.inputs, onUpdateBlock],
  );
  const handleUpdateInput = useCallback(
    (name: string, key: string) => {
      const binding: BlockInputBinding = { kind: 'var', key };
      onUpdateBlock({ inputs: { ...block.inputs, [name]: binding } });
    },
    [block.inputs, onUpdateBlock],
  );
  const handleRenameInput = useCallback(
    (oldName: string, newName: string) => {
      if (oldName === newName || !newName.trim()) return;
      const next = { ...block.inputs };
      next[newName] = next[oldName] ?? { kind: 'var' as const, key: '' };
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
  // Build ReactFlow nodes: [Start, ...steps, End] with nested containers.
  const { rfNodes, rfEdges } = useMemo(() => {
    const nodes: Node<AnyNodeData>[] = [];
    const edges: Edge[] = [];

    // Layout constants for nesting
    const STEP_W = 320;
    const STEP_H = 140;
    const CHILD_GAP = 20;
    const CONTAINER_PAD_X = 24;
    const CONTAINER_PAD_TOP = 44; // header height
    const CONTAINER_PAD_BOTTOM = 24;

    // Look up a step's children, sorted by order.
    const childrenOf = (parentId: string): Step[] =>
      block.steps
        .filter((s) => s.parentStepId === parentId)
        .sort((a, b) => a.order - b.order);

    // Recursively measure a step's display size.
    // Containers grow to fit their (possibly nested) children.
    const measure = (step: Step): { w: number; h: number } => {
      const isContainer =
        step.type === 'loop' ||
        step.type === 'branch' ||
        step.type === 'switch' ||
        step.type === 'group';
      if (!isContainer) return { w: STEP_W, h: STEP_H };
      const kids = childrenOf(step.id);
      if (kids.length === 0) return { w: STEP_W + 40, h: STEP_H + 60 };
      const sizes = kids.map(measure);
      const w =
        sizes.reduce((sum, s) => sum + s.w, 0) +
        (kids.length - 1) * CHILD_GAP +
        CONTAINER_PAD_X * 2;
      const h =
        Math.max(...sizes.map((s) => s.h)) +
        CONTAINER_PAD_TOP +
        CONTAINER_PAD_BOTTOM;
      return { w, h };
    };

    // Recursively render a step (and its children, if container).
    // Returns the size used.
    const renderStep = (
      step: Step,
      x: number,
      y: number,
      parentId: string | undefined,
    ): { w: number; h: number } => {
      const isContainer =
        step.type === 'loop' ||
        step.type === 'branch' ||
        step.type === 'switch' ||
        step.type === 'group';
      const size = measure(step);

      if (isContainer) {
        const kids = childrenOf(step.id);
        nodes.push({
          id: step.id,
          type: 'container',
          position: { x, y },
          parentId,
          extent: parentId ? 'parent' : undefined,
          dragHandle: '.drag-handle',
          data: {
            step,
            status: executionStatus[step.id] ?? 'idle',
            width: size.w,
            height: size.h,
            childCount: kids.length,
            onDelete: handleDeleteStep,
            onAddChild: (parent: string) => {
              setAddStepParent(parent);
              setAddStepOpen(true);
            },
          } as ContainerNodeData,
        });
        // Render children inside.
        let childX = CONTAINER_PAD_X;
        const childY = CONTAINER_PAD_TOP;
        for (const child of kids) {
          const childSize = renderStep(child, childX, childY, step.id);
          // Edge between adjacent children
          const idx = kids.indexOf(child);
          if (idx > 0) {
            const prev = kids[idx - 1];
            edges.push({
              id: `e-${prev.id}-${child.id}`,
              source: prev.id,
              target: child.id,
              type: 'add',
              data: {
                onAdd: () => {
                  setAddStepParent(step.id);
                  setAddStepOpen(true);
                },
              } as AddEdgeData,
            });
          }
          childX += childSize.w + CHILD_GAP;
        }
      } else {
        // Leaf step (action / wait / subroutine)
        nodes.push({
          id: step.id,
          type: 'step',
          position: { x, y },
          parentId,
          extent: parentId ? 'parent' : undefined,
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
      }
      return size;
    };

    // Top-level layout: Start | step* | End in a horizontal row.
    const topLevel = block.steps
      .filter((s) => !s.parentStepId)
      .sort((a, b) => a.order - b.order);

    const NODE_Y_TOP = 100;
    let cursorX = 0;

    // Start node
    nodes.push({
      id: START_ID,
      type: 'start',
      position: { x: cursorX, y: NODE_Y_TOP },
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
    cursorX += 280 + CHILD_GAP;

    // Step nodes (top-level)
    topLevel.forEach((step) => {
      const size = renderStep(step, cursorX, NODE_Y_TOP, undefined);
      cursorX += size.w + CHILD_GAP;
    });

    // End node
    nodes.push({
      id: END_ID,
      type: 'end',
      position: { x: cursorX, y: NODE_Y_TOP },
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

    // Top-level chain edges: Start → step0 → ... → End
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

    // Data-flow edges: derived from shared scenario variable keys.
    // Walks ALL steps (including nested) so cross-container connections show.
    const writers = new Map<string, { stepId: string; portName: string }>();
    for (const step of block.steps) {
      if (!step.bindings) continue;
      const manifest = step.nodeId ? manifestMap.get(step.nodeId) : undefined;
      if (!manifest) continue;
      for (const [portName, binding] of Object.entries(step.bindings)) {
        if (binding.kind !== 'var') continue;
        const def = manifest.ports[portName];
        if (def?.kind !== 'out') continue;
        writers.set(binding.key, { stepId: step.id, portName });
      }
    }
    for (const step of block.steps) {
      if (!step.bindings) continue;
      const manifest = step.nodeId ? manifestMap.get(step.nodeId) : undefined;
      if (!manifest) continue;
      for (const [portName, binding] of Object.entries(step.bindings)) {
        if (binding.kind !== 'var') continue;
        const def = manifest.ports[portName];
        if (def?.kind !== 'in') continue;
        const writer = writers.get(binding.key);
        if (!writer || writer.stepId === step.id) continue;
        edges.push({
          id: `df-${writer.stepId}-${writer.portName}-${step.id}-${portName}`,
          source: writer.stepId,
          sourceHandle: writer.portName,
          target: step.id,
          targetHandle: portName,
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2 },
          label: binding.key,
          labelStyle: { fontSize: 8, fill: 'var(--fl-text-faint)' },
          labelBgStyle: { fill: 'var(--fl-panel-2)' },
        });
      }
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
        // Only reorder TOP-LEVEL nodes (no parentId). Container children
        // are positioned by the layout algorithm and shouldn't drag-reorder.
        const stepNodes = nodes.filter(
          (n) => n.id !== START_ID && n.id !== END_ID && !n.parentId,
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
            !s.parentStepId && orderMap.has(s.id)
              ? { ...s, order: orderMap.get(s.id)! }
              : s,
          ),
        });
      }
    },
    [onNodesChange, nodes, block.steps, onUpdateBlock],
  );

  // ── Port-to-port connection (data flow) ───
  // When user drags from out-port handle to in-port handle, set both
  // step bindings to share a generated scenario variable key.
  const handleConnect = useCallback(
    (params: { source: string | null; sourceHandle: string | null; target: string | null; targetHandle: string | null }) => {
      const { source, sourceHandle, target, targetHandle } = params;
      if (!source || !sourceHandle || !target || !targetHandle) return;
      if (source === START_ID || target === END_ID) return; // start/end are handled separately
      if (source === target) return;
      const sourceStep = block.steps.find((s) => s.id === source);
      const targetStep = block.steps.find((s) => s.id === target);
      if (!sourceStep || !targetStep) return;

      // Generate a unique link key (short and readable).
      const linkKey = `scenario._link_${Math.random().toString(36).slice(2, 8)}`;

      onUpdateBlock({
        steps: block.steps.map((s) => {
          if (s.id === source) {
            return {
              ...s,
              bindings: {
                ...s.bindings,
                [sourceHandle]: { kind: 'var' as const, key: linkKey },
              },
            };
          }
          if (s.id === target) {
            return {
              ...s,
              bindings: {
                ...s.bindings,
                [targetHandle]: { kind: 'var' as const, key: linkKey },
              },
            };
          }
          return s;
        }),
      });
    },
    [block.steps, onUpdateBlock],
  );

  const handleAddStep = (step: Step) => {
    if (addStepParent) {
      // Insert as a child of the container step at the end of its current children.
      const siblings = block.steps
        .filter((s) => s.parentStepId === addStepParent)
        .sort((a, b) => a.order - b.order);
      const nextChildOrder = siblings.length;
      const newStep = {
        ...step,
        parentStepId: addStepParent,
        order: nextChildOrder,
      };
      onUpdateBlock({ steps: [...block.steps, newStep] });
      return;
    }
    // Top-level: insert at insertIndex.
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
          onConnect={handleConnect}
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
        onOpenChange={(o) => {
          setAddStepOpen(o);
          if (!o) setAddStepParent(undefined);
        }}
        blockLabel={block.label}
        nextOrder={insertIndex}
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
