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

    // Layout constants for nesting.
    // Generous spacing so exec wires + data wires have room to breathe
    // (Bolt / Blueprint style).
    const STEP_W = 320;
    const STEP_H = 140;
    const CHILD_GAP = 90;
    const CONTAINER_PAD_X = 40;
    const CONTAINER_PAD_TOP = 56; // header height
    const CONTAINER_PAD_BOTTOM = 32;

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
    // Returns the size used. Position is always auto-computed left-to-right
    // by order; drag updates the order field rather than free position.
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
      const pos = { x, y };

      if (isContainer) {
        const kids = childrenOf(step.id);
        nodes.push({
          id: step.id,
          type: 'container',
          position: pos,
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
          // Exec edge between adjacent children
          const idx = kids.indexOf(child);
          if (idx > 0) {
            const prev = kids[idx - 1];
            edges.push({
              id: `exec-${prev.id}-${child.id}`,
              source: prev.id,
              sourceHandle: '__exec__',
              target: child.id,
              targetHandle: '__exec__',
              type: 'add',
              style: { stroke: '#cbd5e1', strokeWidth: 3 },
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
          position: pos,
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

    // Top-level steps: split into "in flow" (on the exec rail) and
    // "off flow" (free-area pure nodes that connect via data wires only).
    const topLevel = block.steps
      .filter((s) => !s.parentStepId)
      .sort((a, b) => a.order - b.order);

    const inFlowSteps = topLevel.filter((s) => s.inFlow !== false);
    const offFlowSteps = topLevel.filter((s) => s.inFlow === false);

    const NODE_Y_TOP = 100;
    const FREE_AREA_Y = NODE_Y_TOP + 360; // below the main rail
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
    cursorX += 260 + CHILD_GAP;

    // In-flow step nodes (top-level, on the exec rail)
    inFlowSteps.forEach((step) => {
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

    // Off-flow step nodes (free-area pure nodes). They render at their
    // stored position; if no position is set yet (newly detached or
    // freshly added), fall back to a tidy row below the rail.
    let freeFallbackX = 0;
    offFlowSteps.forEach((step) => {
      const fallback = { x: freeFallbackX, y: FREE_AREA_Y };
      const pos = step.position ?? fallback;
      renderStep(step, pos.x, pos.y, undefined);
      freeFallbackX += STEP_W + CHILD_GAP;
    });

    // Exec (control flow) edges: Start → in-flow step0 → ... → End.
    // Use the dedicated "__exec__" handles which live at the top of
    // each node, so they do NOT collide with the data-port handles
    // inside the node body. Off-flow pure nodes are excluded.
    const execChain: Array<{ id: string; sourceHandle: string; targetHandle: string }> = [
      { id: START_ID, sourceHandle: '__exec__', targetHandle: '__exec__' },
      ...inFlowSteps.map((s) => ({
        id: s.id,
        sourceHandle: '__exec__',
        targetHandle: '__exec__',
      })),
      { id: END_ID, sourceHandle: '__exec__', targetHandle: '__exec__' },
    ];
    for (let i = 0; i < execChain.length - 1; i++) {
      const a = execChain[i];
      const b = execChain[i + 1];
      edges.push({
        id: `exec-${a.id}-${b.id}`,
        source: a.id,
        sourceHandle: a.sourceHandle,
        target: b.id,
        targetHandle: b.targetHandle,
        type: 'add',
        style: { stroke: '#cbd5e1', strokeWidth: 3 },
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

      // On drag end of a top-level step:
      //  - If dropped above the free-area threshold: it belongs to the
      //    exec rail. Reorder by x. If it was previously off-flow,
      //    re-attach (clear position, set inFlow).
      //  - If dropped below the threshold: it becomes a free-area pure
      //    node. Persist position, mark inFlow=false. Containers are
      //    forbidden from detaching (they ARE control flow).
      const dragEnds = filtered.filter(
        (c) => c.type === 'position' && !c.dragging && c.position,
      );
      if (dragEnds.length === 0) return;

      // Threshold for "below the rail = free area".
      // Rail Y is 100, step heights ~140-180, so anything below ~300
      // is comfortably in the free zone.
      const FREE_THRESHOLD_Y = 300;
      const isContainerType = (t: Step['type']) =>
        t === 'loop' || t === 'branch' || t === 'switch' || t === 'group';

      // step.id → new x position (for in-flow nodes)
      const newRailX = new Map<string, number>();
      // step.id → new free-area position (for off-flow nodes)
      const newFreePos = new Map<string, { x: number; y: number }>();
      // step.id → new inFlow value (only for transitions)
      const flowToggle = new Map<string, boolean>();
      let touchedTopLevel = false;

      for (const ch of dragEnds) {
        if (ch.type !== 'position' || !ch.position) continue;
        const step = block.steps.find((s) => s.id === ch.id);
        if (!step || step.parentStepId) continue;
        touchedTopLevel = true;

        const wasInFlow = step.inFlow !== false;
        const dropY = ch.position.y;

        // Containers always stay on the rail.
        if (isContainerType(step.type)) {
          newRailX.set(step.id, ch.position.x);
          if (!wasInFlow) flowToggle.set(step.id, true);
          continue;
        }

        const goesToRail = dropY < FREE_THRESHOLD_Y;
        if (goesToRail) {
          newRailX.set(step.id, ch.position.x);
          if (!wasInFlow) flowToggle.set(step.id, true);
        } else {
          newFreePos.set(step.id, ch.position);
          if (wasInFlow) flowToggle.set(step.id, false);
        }
      }
      if (!touchedTopLevel) return;

      // Recompute order for in-flow top-level steps based on effective x.
      // Includes both currently in-flow steps and any newly attached.
      const topLevelSteps = block.steps.filter((s) => !s.parentStepId);
      const inFlowAfter = topLevelSteps.filter((s) => {
        const toggled = flowToggle.get(s.id);
        if (toggled !== undefined) return toggled;
        return s.inFlow !== false;
      });
      const withX = inFlowAfter.map((s) => {
        const draggedX = newRailX.get(s.id);
        if (draggedX !== undefined) return { step: s, x: draggedX };
        const node = rfNodes.find((n) => n.id === s.id);
        return { step: s, x: node?.position.x ?? s.order * 1000 };
      });
      withX.sort((a, b) => a.x - b.x);
      const orderMap = new Map<string, number>();
      withX.forEach(({ step }, i) => orderMap.set(step.id, i));

      onUpdateBlock({
        steps: block.steps.map((s) => {
          if (s.parentStepId) return s;
          const next: Step = { ...s };
          if (orderMap.has(s.id)) next.order = orderMap.get(s.id)!;
          if (flowToggle.has(s.id)) {
            const nowInFlow = flowToggle.get(s.id)!;
            if (nowInFlow) {
              next.inFlow = true;
              next.position = undefined;
            } else {
              next.inFlow = false;
            }
          }
          if (newFreePos.has(s.id)) {
            next.position = newFreePos.get(s.id);
          }
          return next;
        }),
      });
    },
    [onNodesChange, block.steps, rfNodes, onUpdateBlock],
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
      // Exec handles are auto-derived from `order` — ignore manual wiring.
      if (sourceHandle === '__exec__' || targetHandle === '__exec__') return;
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

        {/* Floating "+" button to add a new top-level step at the end. */}
        <button
          type="button"
          onClick={() => {
            const topLevelCount = block.steps.filter(
              (s) => !s.parentStepId,
            ).length;
            handleOpenAdd(topLevelCount);
          }}
          className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-lg border border-fl-border bg-fl-panel px-3 py-1.5 font-mono text-[10px] font-bold text-fl-text shadow transition-colors hover:border-[#3b82f6] hover:text-[#3b82f6]"
          title="ステップを追加"
        >
          <span className="text-base leading-none">+</span>
          ステップ追加
        </button>
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
