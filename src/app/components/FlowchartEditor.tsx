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
import { ExecEdge } from './ExecEdge';
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
  exec: ExecEdge,
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
      const newSteps = reorderSteps(
        block.steps.filter(
          (s) => s.id !== stepId && s.parentStepId !== stepId,
        ),
      );

      // Clean up exec edges that reference the deleted step. If the
      // step was in the middle of a chain (X → step → Y), stitch it
      // closed with (X → Y) so the chain stays connected.
      const patch: Partial<Block> = { steps: newSteps };
      if (block.execEdges && block.execEdges.length > 0) {
        const ins = block.execEdges.filter((e) => e.to === stepId);
        const outs = block.execEdges.filter((e) => e.from === stepId);
        const kept = block.execEdges.filter(
          (e) => e.from !== stepId && e.to !== stepId,
        );
        const stitched: Array<{ from: string; to: string }> = [];
        for (const i of ins) {
          for (const o of outs) {
            if (i.from === o.to) continue; // avoid self-loop
            if (kept.some((e) => e.from === i.from && e.to === o.to)) continue;
            if (stitched.some((e) => e.from === i.from && e.to === o.to)) continue;
            stitched.push({ from: i.from, to: o.to });
          }
        }
        patch.execEdges = [...kept, ...stitched];
      }

      onUpdateBlock(patch);
    },
    [block.steps, block.execEdges, onUpdateBlock],
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
              type: 'exec',
              deletable: false,
              selectable: false,
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

    // Top-level steps: all free-positioned. If a step has no stored
    // position yet (freshly added), fall back to a grid computed from
    // its `order` so it lands in a sensible spot.
    const topLevel = block.steps
      .filter((s) => !s.parentStepId)
      .sort((a, b) => a.order - b.order);

    const NODE_Y_TOP = 200;
    const GRID_ORIGIN_X = 360;
    const GRID_COL_W = STEP_W + CHILD_GAP;

    // Resolve the effective position for a top-level step.
    const resolveTopLevelPos = (step: Step, fallbackIdx: number) => {
      if (step.position) return step.position;
      return {
        x: GRID_ORIGIN_X + fallbackIdx * GRID_COL_W,
        y: NODE_Y_TOP,
      };
    };

    // Start node — user-draggable; defaults to the far left.
    const startPos = block.startPos ?? { x: 0, y: NODE_Y_TOP };
    nodes.push({
      id: START_ID,
      type: 'start',
      position: startPos,
      dragHandle: '.drag-handle',
      data: {
        inputs: block.inputs ?? {},
        scenarioVariables,
        onAddInput: handleAddInput,
        onUpdateInput: handleUpdateInput,
        onRenameInput: handleRenameInput,
        onDeleteInput: handleDeleteInput,
      } as StartNodeData,
    });

    // Top-level step nodes at their own positions.
    let maxRightEdge = startPos.x + 260 + CHILD_GAP;
    topLevel.forEach((step, idx) => {
      const pos = resolveTopLevelPos(step, idx);
      const size = renderStep(step, pos.x, pos.y, undefined);
      maxRightEdge = Math.max(maxRightEdge, pos.x + size.w + CHILD_GAP);
    });

    // End node — user-draggable; defaults to the right of the rightmost step.
    const endPos = block.endPos ?? { x: maxRightEdge, y: NODE_Y_TOP };
    nodes.push({
      id: END_ID,
      type: 'end',
      position: endPos,
      dragHandle: '.drag-handle',
      data: {
        outputs: block.outputs ?? {},
        scenarioVariables,
        onAddOutput: handleAddOutput,
        onUpdateOutput: handleUpdateOutput,
        onRenameOutput: handleRenameOutput,
        onDeleteOutput: handleDeleteOutput,
      } as EndNodeData,
    });

    // Exec (control flow) edges — either manual from block.execEdges
    // or an auto linear fallback when no edges have been authored yet.
    // The manual graph is fully user-editable: draw to connect, select
    // + Delete to disconnect.
    const manualExecEdges = block.execEdges;
    const effectiveExecEdges: Array<{ from: string; to: string }> =
      manualExecEdges && manualExecEdges.length > 0
        ? manualExecEdges
        : [
            { from: START_ID, to: topLevel[0]?.id ?? END_ID },
            ...topLevel
              .slice(0, -1)
              .map((s, i) => ({ from: s.id, to: topLevel[i + 1].id })),
            ...(topLevel.length > 0
              ? [{ from: topLevel[topLevel.length - 1].id, to: END_ID }]
              : []),
          ];
    for (const e of effectiveExecEdges) {
      edges.push({
        id: `exec-${e.from}--${e.to}`,
        source: e.from,
        sourceHandle: '__exec__',
        target: e.to,
        targetHandle: '__exec__',
        type: 'exec',
        deletable: true,
        selectable: true,
        data: { kind: 'exec', from: e.from, to: e.to },
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
          data: {
            kind: 'data',
            writerStepId: writer.stepId,
            writerPort: writer.portName,
            readerStepId: step.id,
            readerPort: portName,
          },
        });
      }
    }

    return { rfNodes: nodes, rfEdges: edges };
  }, [
    block.steps,
    block.inputs,
    block.outputs,
    block.startPos,
    block.endPos,
    block.execEdges,
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
      onNodesChange(changes);

      const dragEnds = changes.filter(
        (c) => c.type === 'position' && !c.dragging && c.position,
      );
      if (dragEnds.length === 0) return;

      // Collect Start/End drags separately — they persist to block.startPos/endPos.
      let newStartPos: { x: number; y: number } | undefined;
      let newEndPos: { x: number; y: number } | undefined;
      const stepPosUpdates = new Map<string, { x: number; y: number }>();

      for (const ch of dragEnds) {
        if (ch.type !== 'position' || !ch.position) continue;
        if (ch.id === START_ID) {
          newStartPos = ch.position;
          continue;
        }
        if (ch.id === END_ID) {
          newEndPos = ch.position;
          continue;
        }
        const step = block.steps.find((s) => s.id === ch.id);
        if (!step || step.parentStepId) continue; // top-level steps only
        stepPosUpdates.set(step.id, ch.position);
      }

      const touchedSteps = stepPosUpdates.size > 0;
      const touchedAnchors = !!(newStartPos || newEndPos);
      if (!touchedSteps && !touchedAnchors) return;

      // Recompute order from x coordinates of all top-level steps so
      // the auto-derived exec chain still reads left-to-right.
      let nextSteps = block.steps;
      if (touchedSteps) {
        const topLevelSteps = block.steps.filter((s) => !s.parentStepId);
        const withX = topLevelSteps.map((s) => {
          const dragged = stepPosUpdates.get(s.id);
          if (dragged) return { step: s, x: dragged.x };
          if (s.position) return { step: s, x: s.position.x };
          const node = rfNodes.find((n) => n.id === s.id);
          return { step: s, x: node?.position.x ?? s.order * 1000 };
        });
        withX.sort((a, b) => a.x - b.x);
        const orderMap = new Map<string, number>();
        withX.forEach(({ step }, i) => orderMap.set(step.id, i));

        nextSteps = block.steps.map((s) => {
          if (s.parentStepId) return s;
          const next: Step = { ...s };
          if (orderMap.has(s.id)) next.order = orderMap.get(s.id)!;
          if (stepPosUpdates.has(s.id)) next.position = stepPosUpdates.get(s.id);
          return next;
        });
      }

      const patch: Partial<Block> = {};
      if (touchedSteps) patch.steps = nextSteps;
      if (newStartPos) patch.startPos = newStartPos;
      if (newEndPos) patch.endPos = newEndPos;
      onUpdateBlock(patch);
    },
    [onNodesChange, block.steps, rfNodes, onUpdateBlock],
  );

  // Compute the current effective exec graph (manual if set,
  // otherwise the auto linear chain). Used to "snapshot → manual"
  // on the first exec-edge edit so subsequent edits preserve intent.
  const getEffectiveExecEdges = useCallback((): Array<{ from: string; to: string }> => {
    if (block.execEdges && block.execEdges.length > 0) return block.execEdges;
    const top = block.steps
      .filter((s) => !s.parentStepId)
      .sort((a, b) => a.order - b.order);
    if (top.length === 0) return [{ from: START_ID, to: END_ID }];
    const out: Array<{ from: string; to: string }> = [
      { from: START_ID, to: top[0].id },
    ];
    for (let i = 0; i < top.length - 1; i++) {
      out.push({ from: top[i].id, to: top[i + 1].id });
    }
    out.push({ from: top[top.length - 1].id, to: END_ID });
    return out;
  }, [block.execEdges, block.steps]);

  // ── Edge deletion (exec or data wire) ───
  // Exec edges: removed from block.execEdges (first edit snapshots
  //   the fallback linear chain into manual mode).
  // Data edges: clears the shared-var binding at both ends so the
  //   edge stops being derived on the next render.
  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (deleted.length === 0) return;

      const execToRemove: Array<{ from: string; to: string }> = [];
      const dataToRemove: Array<{
        writerStepId: string;
        writerPort: string;
        readerStepId: string;
        readerPort: string;
      }> = [];
      for (const edge of deleted) {
        const d = edge.data as
          | {
              kind?: string;
              from?: string;
              to?: string;
              writerStepId?: string;
              writerPort?: string;
              readerStepId?: string;
              readerPort?: string;
            }
          | undefined;
        if (!d) continue;
        if (d.kind === 'exec' && d.from && d.to) {
          execToRemove.push({ from: d.from, to: d.to });
        } else if (
          d.kind === 'data' &&
          d.writerStepId &&
          d.writerPort &&
          d.readerStepId &&
          d.readerPort
        ) {
          dataToRemove.push({
            writerStepId: d.writerStepId,
            writerPort: d.writerPort,
            readerStepId: d.readerStepId,
            readerPort: d.readerPort,
          });
        }
      }

      const patch: Partial<Block> = {};

      if (execToRemove.length > 0) {
        const current = getEffectiveExecEdges();
        const next = current.filter(
          (e) =>
            !execToRemove.some((r) => r.from === e.from && r.to === e.to),
        );
        patch.execEdges = next;
      }

      if (dataToRemove.length > 0) {
        let steps = block.steps;
        let changed = false;
        for (const r of dataToRemove) {
          steps = steps.map((s) => {
            if (s.id === r.writerStepId && s.bindings && r.writerPort in s.bindings) {
              const next = { ...s, bindings: { ...s.bindings } };
              delete next.bindings[r.writerPort];
              changed = true;
              return next;
            }
            if (s.id === r.readerStepId && s.bindings && r.readerPort in s.bindings) {
              const next = { ...s, bindings: { ...s.bindings } };
              delete next.bindings[r.readerPort];
              changed = true;
              return next;
            }
            return s;
          });
        }
        if (changed) patch.steps = steps;
      }

      if (Object.keys(patch).length > 0) onUpdateBlock(patch);
    },
    [block.steps, getEffectiveExecEdges, onUpdateBlock],
  );

  // ── Port-to-port connection (data flow) ───
  // When user drags from out-port handle to in-port handle, set both
  // step bindings to share a generated scenario variable key.
  const handleConnect = useCallback(
    (params: { source: string | null; sourceHandle: string | null; target: string | null; targetHandle: string | null }) => {
      const { source, sourceHandle, target, targetHandle } = params;
      if (!source || !sourceHandle || !target || !targetHandle) return;
      if (source === target) return;

      // Exec handle drag → add a new exec edge to the graph.
      if (sourceHandle === '__exec__' && targetHandle === '__exec__') {
        const current = getEffectiveExecEdges();
        const exists = current.some((e) => e.from === source && e.to === target);
        if (exists) return;
        onUpdateBlock({ execEdges: [...current, { from: source, to: target }] });
        return;
      }

      // Data wire: start/end are handled separately (block inputs/outputs).
      if (source === START_ID || target === END_ID) return;
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
    [block.steps, getEffectiveExecEdges, onUpdateBlock],
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

    // Top-level insertion.
    //
    // UX goals:
    //   1. Auto-wire the new step into the exec chain right before
    //      End, so the user doesn't have to re-wire on every add.
    //   2. Pin End's current position so adding steps never pushes it
    //      around.
    //   3. Place the new step visually at the midpoint of the wire
    //      it just cut into (previous tail → End), so it feels like
    //      the chain naturally makes room for it.
    const STEP_W_LOCAL = 320;
    const CHILD_GAP_LOCAL = 90;
    const NODE_Y_LOCAL = 200;

    const topLevel = block.steps
      .filter((s) => !s.parentStepId)
      .sort((a, b) => a.order - b.order);

    const startPos = block.startPos ?? { x: 0, y: NODE_Y_LOCAL };

    // Compute the effective End position (before this add) so we can
    // pin it and compute the midpoint.
    const computeAutoEndPos = () => {
      let maxRight = startPos.x + 260 + CHILD_GAP_LOCAL;
      topLevel.forEach((s, idx) => {
        const p =
          s.position ?? {
            x: 360 + idx * (STEP_W_LOCAL + CHILD_GAP_LOCAL),
            y: NODE_Y_LOCAL,
          };
        maxRight = Math.max(maxRight, p.x + STEP_W_LOCAL + CHILD_GAP_LOCAL);
      });
      return { x: maxRight, y: startPos.y };
    };
    const currentEndPos = block.endPos ?? computeAutoEndPos();

    // Find the current "tail before End" node so we know where to
    // cut in. If the graph is empty or in a weird state, fall back
    // to Start.
    const currentEdges = getEffectiveExecEdges();
    const edgeToEnd = currentEdges.find((e) => e.to === END_ID);
    const tailId = edgeToEnd?.from ?? START_ID;
    const tailPos: { x: number; y: number } = (() => {
      if (tailId === START_ID) return startPos;
      const tailStep = block.steps.find((s) => s.id === tailId);
      if (!tailStep) return startPos;
      if (tailStep.position) return tailStep.position;
      const idx = topLevel.indexOf(tailStep);
      return {
        x: 360 + idx * (STEP_W_LOCAL + CHILD_GAP_LOCAL),
        y: NODE_Y_LOCAL,
      };
    })();

    // Midpoint of the (tail → End) wire, minus half the step width
    // so the node is centered on the wire.
    const midX = (tailPos.x + currentEndPos.x) / 2 - STEP_W_LOCAL / 2;
    const midY = (tailPos.y + currentEndPos.y) / 2;

    const newStep: Step = {
      ...step,
      order: topLevel.length,
      position: { x: midX, y: midY },
    };

    // Rewire exec edges: replace every (X → End) with (X → newStep),
    // then add (newStep → End). If there was no edge to End, just
    // append (newStep → End).
    const edgesToEnd = currentEdges.filter((e) => e.to === END_ID);
    const nextEdges: Array<{ from: string; to: string }> =
      edgesToEnd.length > 0
        ? [
            ...currentEdges.filter((e) => e.to !== END_ID),
            ...edgesToEnd.map((e) => ({ from: e.from, to: newStep.id })),
            { from: newStep.id, to: END_ID },
          ]
        : [...currentEdges, { from: newStep.id, to: END_ID }];

    onUpdateBlock({
      steps: [...block.steps, newStep],
      execEdges: nextEdges,
      endPos: currentEndPos,
    });
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
          onEdgesDelete={handleEdgesDelete}
          onConnect={handleConnect}
          deleteKeyCode={['Backspace', 'Delete']}
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
