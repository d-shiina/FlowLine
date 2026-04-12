import { useCallback, useRef, useState } from 'react';
import type { Block, Step, Subroutine } from '../types';
import type { BlockStatus } from '../engine';
import type { NodeManifestEntry } from '../../globals';
import { Breadcrumb } from './Breadcrumb';
import { FlowchartStepView, StepConnector } from './FlowchartStepView';
import { FlowchartGroupView } from './FlowchartGroupView';
import { AddStepModal } from './AddStepModal';
import { StepInspector } from './StepInspector';
import { StepGhost } from './StepGhost';
import { FlowchartContextMenu } from './FlowchartContextMenu';
import { uid } from '../useScenario';

interface Props {
  block: Block;
  trackName: string;
  trackColor: string;
  scenarioName: string;
  subroutines: Subroutine[];
  nodeManifest: NodeManifestEntry[];
  scenarioVariables: Record<string, unknown>;
  /** Live execution status map (blockId/stepId → status). */
  executionStatus: Record<string, BlockStatus>;
  /** Whether execution is currently running. */
  running: boolean;
  onBack: () => void;
  onUpdateBlock: (patch: Partial<Block>) => void;
  onCreateVariable: (key: string, value: unknown) => void;
  /** Partial execution triggers. */
  onRunStep?: (stepId: string) => void;
  onRunFromStep?: (stepId: string) => void;
  onRunBlock?: () => void;
}

/** Height of each step card + connector for layout calculation. */
const STEP_H = 52;
const CONNECTOR_H = 16;
const FLOW_STEP_PITCH = STEP_H + CONNECTOR_H;
/** X center of the main flow lane on the canvas. */
const FLOW_CENTER_X = 400;
/** Y start of the main flow lane. */
const FLOW_START_Y = 60;
/** Width of the main flow lane visual guide. */
const FLOW_LANE_W = 280;

// ── Helpers ──────────────────────────────────

function isInFlow(s: Step): boolean {
  return s.inFlow !== false;
}

function reorderSteps(steps: Step[]): Step[] {
  // Reassign order 0,1,2,... to all in-flow top-level steps
  const sorted = steps
    .filter((s) => isInFlow(s) && !s.parentStepId)
    .sort((a, b) => a.order - b.order);
  const orderMap = new Map<string, number>();
  sorted.forEach((s, i) => orderMap.set(s.id, i));
  return steps.map((s) =>
    orderMap.has(s.id) ? { ...s, order: orderMap.get(s.id)! } : s,
  );
}

// ── Drop target detection ────────────────────

type DropTarget =
  | { kind: 'flow-insert'; index: number }
  | { kind: 'group'; groupId: string }
  | { kind: 'free'; x: number; y: number };

function hitTestDropTarget(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  scrollTop: number,
  topLevelSteps: Step[],
  allSteps: Step[],
): DropTarget {
  const cx = clientX - canvasRect.left;
  const cy = clientY - canvasRect.top + scrollTop;

  // Check if inside main flow lane
  const flowLeft = FLOW_CENTER_X - FLOW_LANE_W / 2;
  const flowRight = FLOW_CENTER_X + FLOW_LANE_W / 2;
  const inFlowLane = cx >= flowLeft && cx <= flowRight;

  if (inFlowLane) {
    // Check each group for hit
    for (let i = 0; i < topLevelSteps.length; i++) {
      const step = topLevelSteps[i];
      if (step.type !== 'group') continue;
      const stepY = FLOW_START_Y + i * FLOW_STEP_PITCH;
      const childCount = allSteps.filter(
        (s) => s.parentStepId === step.id,
      ).length;
      const groupH = STEP_H + (childCount > 0 ? childCount * 36 + 40 : 30);
      if (cy >= stepY && cy <= stepY + groupH) {
        return { kind: 'group', groupId: step.id };
      }
    }

    // Find insert position between steps
    const insertIndex = Math.max(
      0,
      Math.min(
        topLevelSteps.length,
        Math.round((cy - FLOW_START_Y + CONNECTOR_H / 2) / FLOW_STEP_PITCH),
      ),
    );
    return { kind: 'flow-insert', index: insertIndex };
  }

  // Free area
  return { kind: 'free', x: cx, y: cy };
}

// ── Component ────────────────────────────────

export function FlowchartEditor({
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
  onRunFromStep,
  onRunBlock,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [addStepParent, setAddStepParent] = useState<string | undefined>(
    undefined,
  );

  // Drag state
  const [dragStepId, setDragStepId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // Rubber-band selection
  const [rubberBand, setRubberBand] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedStepId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedStep = selectedStepId
    ? (block.steps.find((s) => s.id === selectedStepId) ?? null)
    : null;

  const topLevelFlowSteps = block.steps
    .filter((s) => isInFlow(s) && !s.parentStepId)
    .sort((a, b) => a.order - b.order);

  const freeSteps = block.steps.filter(
    (s) => !isInFlow(s) && !s.parentStepId,
  );

  const nextOrder =
    block.steps.length > 0
      ? Math.max(...block.steps.map((s) => s.order)) + 1
      : 0;

  // ── Step mutations ─────────────────────────

  const handleUpdateStep = (stepId: string, patch: Partial<Step>) => {
    onUpdateBlock({
      steps: block.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    });
  };

  const handleAddStep = (step: Step) => {
    onUpdateBlock({ steps: [...block.steps, step] });
  };

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      onUpdateBlock({
        steps: reorderSteps(
          block.steps.filter(
            (s) => s.id !== stepId && s.parentStepId !== stepId,
          ),
        ),
      });
      setSelectedIds((prev) => prev.filter((id) => id !== stepId));
    },
    [block.steps, onUpdateBlock],
  );

  const handleDeleteSelected = useCallback(() => {
    const ids = new Set(selectedIds);
    onUpdateBlock({
      steps: reorderSteps(
        block.steps.filter(
          (s) => !ids.has(s.id) && (!s.parentStepId || !ids.has(s.parentStepId)),
        ),
      ),
    });
    setSelectedIds([]);
  }, [selectedIds, block.steps, onUpdateBlock]);

  const handleDuplicateSelected = useCallback(() => {
    const ids = new Set(selectedIds);
    const idMap = new Map<string, string>();
    const dupes: Step[] = [];
    for (const s of block.steps) {
      if (!ids.has(s.id)) continue;
      const newId = uid('s');
      idMap.set(s.id, newId);
      dupes.push({
        ...s,
        id: newId,
        label: `${s.label} (copy)`,
        order: nextOrder + dupes.length,
        inFlow: false,
        position: s.position
          ? { x: s.position.x + 30, y: s.position.y + 30 }
          : { x: FLOW_CENTER_X + 200, y: 100 + dupes.length * 70 },
      });
    }
    // Remap parentStepId for children within the selection
    for (const d of dupes) {
      if (d.parentStepId && idMap.has(d.parentStepId)) {
        d.parentStepId = idMap.get(d.parentStepId)!;
      }
    }
    onUpdateBlock({ steps: [...block.steps, ...dupes] });
    setSelectedIds(dupes.map((d) => d.id));
  }, [selectedIds, block.steps, nextOrder, onUpdateBlock]);

  // ── Selection ──────────────────────────────

  const handleSelect = useCallback(
    (stepId: string, e?: React.MouseEvent | MouseEvent) => {
      if (e && (e.ctrlKey || e.metaKey)) {
        setSelectedIds((prev) =>
          prev.includes(stepId)
            ? prev.filter((id) => id !== stepId)
            : [...prev, stepId],
        );
      } else if (e && e.shiftKey && selectedIds.length > 0) {
        // Range select within flow steps
        const flowIds = topLevelFlowSteps.map((s) => s.id);
        const lastIdx = flowIds.indexOf(selectedIds[selectedIds.length - 1]);
        const curIdx = flowIds.indexOf(stepId);
        if (lastIdx >= 0 && curIdx >= 0) {
          const lo = Math.min(lastIdx, curIdx);
          const hi = Math.max(lastIdx, curIdx);
          setSelectedIds(flowIds.slice(lo, hi + 1));
        } else {
          setSelectedIds([stepId]);
        }
      } else {
        setSelectedIds([stepId]);
      }
    },
    [selectedIds, topLevelFlowSteps],
  );

  // ── Drag & Drop ────────────────────────────

  // Use a ref so the mouseup closure reads the latest value.
  const dropTargetRef = useRef<DropTarget | null>(null);
  dropTargetRef.current = dropTarget;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyDropRef = useRef<(stepId: string, target: DropTarget) => void>(null as any);

  const handleDragStart = useCallback(
    (stepId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      let didMove = false;
      let latestTarget: DropTarget | null = null;

      // If the step isn't in the selection, select it alone
      if (!selectedIds.includes(stepId)) {
        setSelectedIds([stepId]);
      }

      const onMove = (ev: MouseEvent) => {
        const dx = Math.abs(ev.clientX - startX);
        const dy = Math.abs(ev.clientY - startY);
        if (!didMove && dx + dy < 4) return;
        didMove = true;
        setDragStepId(stepId);
        setGhostPos({ x: ev.clientX, y: ev.clientY });

        // Hit-test for drop target
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const target = hitTestDropTarget(
            ev.clientX,
            ev.clientY,
            rect,
            canvas.scrollTop,
            topLevelFlowSteps.filter((s) => s.id !== stepId),
            block.steps,
          );
          latestTarget = target;
          setDropTarget(target);
        }
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('keydown', onKey);

        if (didMove && latestTarget) {
          applyDropRef.current(stepId, latestTarget);
        }

        setDragStepId(null);
        setGhostPos(null);
        setDropTarget(null);
      };

      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          window.removeEventListener('keydown', onKey);
          setDragStepId(null);
          setGhostPos(null);
          setDropTarget(null);
        }
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('keydown', onKey);
    },
    [selectedIds, topLevelFlowSteps, block.steps],
  );

  const applyDrop = useCallback(
    (stepId: string, target: DropTarget) => {
      let updated = [...block.steps];
      const step = updated.find((s) => s.id === stepId);
      if (!step) return;

      if (target.kind === 'free') {
        updated = updated.map((s) =>
          s.id === stepId
            ? {
                ...s,
                inFlow: false as const,
                position: { x: target.x, y: target.y },
                parentStepId: undefined,
                order: s.order,
              }
            : s,
        );
      } else if (target.kind === 'group') {
        const childCount = updated.filter(
          (s) => s.parentStepId === target.groupId,
        ).length;
        updated = updated.map((s) =>
          s.id === stepId
            ? {
                ...s,
                inFlow: undefined,
                position: undefined,
                parentStepId: target.groupId,
                order: childCount,
              }
            : s,
        );
      } else if (target.kind === 'flow-insert') {
        // Remove from current position, re-insert at index
        const flowSteps = updated
          .filter(
            (s) => isInFlow(s) && !s.parentStepId && s.id !== stepId,
          )
          .sort((a, b) => a.order - b.order);
        flowSteps.splice(target.index, 0, step);
        const orderMap = new Map<string, number>();
        flowSteps.forEach((s, i) => orderMap.set(s.id, i));
        updated = updated.map((s) => {
          if (s.id === stepId) {
            return {
              ...s,
              inFlow: undefined,
              position: undefined,
              parentStepId: undefined,
              order: orderMap.get(s.id) ?? s.order,
            };
          }
          if (orderMap.has(s.id)) {
            return { ...s, order: orderMap.get(s.id)! };
          }
          return s;
        });
      }

      onUpdateBlock({ steps: reorderSteps(updated) });
    },
    [block.steps, onUpdateBlock],
  );
  applyDropRef.current = applyDrop;

  // ── Rubber-band selection ──────────────────

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start rubber-band on left-click on the canvas background
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target !== canvasRef.current && !target.dataset.canvasBg) return;

      // Clear selection on bare canvas click
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        setSelectedIds([]);
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x0 = e.clientX - rect.left;
      const y0 = e.clientY - rect.top + canvas.scrollTop;

      const onMove = (ev: MouseEvent) => {
        const x1 = ev.clientX - rect.left;
        const y1 = ev.clientY - rect.top + canvas.scrollTop;
        setRubberBand({ x0, y0, x1, y1 });

        // Select steps within the rubber-band
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1);
        const maxY = Math.max(y0, y1);

        const hit: string[] = [];

        // Check flow steps
        topLevelFlowSteps.forEach((s, i) => {
          const sy = FLOW_START_Y + i * FLOW_STEP_PITCH;
          const sx = FLOW_CENTER_X - 120;
          const sw = 240;
          const sh = STEP_H;
          if (sx + sw >= minX && sx <= maxX && sy + sh >= minY && sy <= maxY) {
            hit.push(s.id);
          }
        });

        // Check free steps
        freeSteps.forEach((s) => {
          if (!s.position) return;
          const sx = s.position.x - 120;
          const sy = s.position.y;
          const sw = 240;
          const sh = STEP_H;
          if (sx + sw >= minX && sx <= maxX && sy + sh >= minY && sy <= maxY) {
            hit.push(s.id);
          }
        });

        setSelectedIds(hit);
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setRubberBand(null);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [topLevelFlowSteps, freeSteps],
  );

  // ── Context menu actions ───────────────────

  const handleGroup = useCallback(() => {
    if (selectedIds.length < 2) return;
    const groupId = uid('s');
    const selectedSet = new Set(selectedIds);

    // Find max order among selected for insertion point
    const selectedSteps = block.steps.filter((s) => selectedSet.has(s.id));
    const minOrder = Math.min(...selectedSteps.map((s) => s.order));

    const group: Step = {
      id: groupId,
      type: 'group',
      label: 'グループ',
      order: minOrder,
    };

    let childOrder = 0;
    const updated = block.steps
      .filter((s) => !selectedSet.has(s.id))
      .concat([group])
      .concat(
        selectedSteps.map((s) => ({
          ...s,
          parentStepId: groupId,
          order: childOrder++,
          inFlow: undefined,
          position: undefined,
        })),
      );

    onUpdateBlock({ steps: reorderSteps(updated) });
    setSelectedIds([groupId]);
  }, [selectedIds, block.steps, onUpdateBlock]);

  const handleUngroup = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const groupStep = block.steps.find((s) => s.id === selectedIds[0]);
    if (!groupStep || groupStep.type !== 'group') return;

    const children = block.steps
      .filter((s) => s.parentStepId === groupStep.id)
      .sort((a, b) => a.order - b.order);

    // Insert children at the group's order position
    let insertOrder = groupStep.order;
    const updated = block.steps
      .filter((s) => s.id !== groupStep.id && s.parentStepId !== groupStep.id)
      .concat(
        children.map((s) => ({
          ...s,
          parentStepId: undefined,
          order: insertOrder++,
        })),
      );

    onUpdateBlock({ steps: reorderSteps(updated) });
    setSelectedIds(children.map((s) => s.id));
  }, [selectedIds, block.steps, onUpdateBlock]);

  const handleMoveToFree = useCallback(() => {
    let offsetY = 0;
    const updated = block.steps.map((s) => {
      if (!selectedIds.includes(s.id)) return s;
      const pos = { x: FLOW_CENTER_X + 300, y: 100 + offsetY };
      offsetY += 70;
      return { ...s, inFlow: false as const, position: pos };
    });
    onUpdateBlock({ steps: reorderSteps(updated) });
  }, [selectedIds, block.steps, onUpdateBlock]);

  const handleMoveToFlow = useCallback(() => {
    const maxOrder =
      topLevelFlowSteps.length > 0
        ? Math.max(...topLevelFlowSteps.map((s) => s.order)) + 1
        : 0;
    let ord = maxOrder;
    const updated = block.steps.map((s) => {
      if (!selectedIds.includes(s.id)) return s;
      return {
        ...s,
        inFlow: undefined,
        position: undefined,
        parentStepId: undefined,
        order: ord++,
      };
    });
    onUpdateBlock({ steps: reorderSteps(updated) });
  }, [selectedIds, block.steps, topLevelFlowSteps, onUpdateBlock]);

  // ── Computed context menu flags ────────────

  const selectedSteps = block.steps.filter((s) => selectedIds.includes(s.id));
  const hasFlowSteps = selectedSteps.some((s) => isInFlow(s));
  const hasFreeSteps = selectedSteps.some((s) => !isInFlow(s));
  const isGroupSelected =
    selectedIds.length === 1 &&
    block.steps.find((s) => s.id === selectedIds[0])?.type === 'group';

  // ── Canvas size ────────────────────────────

  const flowHeight = FLOW_START_Y + topLevelFlowSteps.length * FLOW_STEP_PITCH + 100;
  const freeMaxY = freeSteps.reduce(
    (max, s) => Math.max(max, (s.position?.y ?? 0) + 80),
    0,
  );
  const canvasHeight = Math.max(600, flowHeight, freeMaxY + 40);

  // ── Drop insert indicator Y ────────────────

  const insertIndicatorY =
    dropTarget?.kind === 'flow-insert'
      ? FLOW_START_Y + dropTarget.index * FLOW_STEP_PITCH - CONNECTOR_H / 2
      : null;

  // ── Render ─────────────────────────────────

  const dragStep = dragStepId
    ? block.steps.find((s) => s.id === dragStepId)
    : null;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Breadcrumb */}
      <div className="flex-shrink-0 border-b border-fl-border bg-fl-panel">
        <Breadcrumb
          segments={[
            { label: scenarioName, onClick: onBack },
            { label: trackName, onClick: onBack },
            { label: block.label },
          ]}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <FlowchartContextMenu
          selectedIds={selectedIds}
          hasFlowSteps={hasFlowSteps}
          hasFreeSteps={hasFreeSteps}
          isGroupSelected={isGroupSelected}
          running={running}
          onGroup={handleGroup}
          onUngroup={handleUngroup}
          onMoveToFree={handleMoveToFree}
          onMoveToFlow={handleMoveToFlow}
          onDuplicate={handleDuplicateSelected}
          onDelete={handleDeleteSelected}
          onRunStep={
            onRunStep && selectedIds.length === 1
              ? () => onRunStep(selectedIds[0])
              : undefined
          }
          onRunFromHere={
            onRunFromStep && selectedIds.length === 1
              ? () => onRunFromStep(selectedIds[0])
              : undefined
          }
          onRunBlock={onRunBlock}
        >
          <div
            ref={canvasRef}
            className="fl-scroll relative flex-1 overflow-y-auto"
            style={{ minHeight: 0 }}
            onMouseDown={handleCanvasMouseDown}
            data-canvas-bg="true"
          >
            <div
              className="relative w-full"
              style={{ height: canvasHeight }}
              data-canvas-bg="true"
            >
              {/* Main flow lane guide */}
              <div
                className="pointer-events-none absolute border-x border-dashed"
                style={{
                  left: FLOW_CENTER_X - FLOW_LANE_W / 2,
                  top: 0,
                  width: FLOW_LANE_W,
                  height: canvasHeight,
                  borderColor: 'var(--fl-border)',
                }}
              />
              <div
                className="pointer-events-none absolute font-mono text-[9px] font-bold tracking-widest"
                style={{
                  left: FLOW_CENTER_X - FLOW_LANE_W / 2 + 8,
                  top: 8,
                  color: 'var(--fl-text-ghost)',
                }}
              >
                MAIN FLOW
              </div>
              <div
                className="pointer-events-none absolute font-mono text-[9px] tracking-widest"
                style={{
                  right: 16,
                  top: 8,
                  color: 'var(--fl-text-ghost)',
                }}
              >
                FREE AREA
              </div>

              {/* Track colour indicator */}
              <div
                className="absolute flex items-center gap-2 font-mono text-[10px] font-bold"
                style={{
                  left: FLOW_CENTER_X - 50,
                  top: FLOW_START_Y - 28,
                  color: trackColor,
                }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: trackColor }}
                />
                {block.label}
              </div>

              {/* Flow steps */}
              {topLevelFlowSteps.map((step, i) => (
                <div
                  key={step.id}
                  className="absolute flex flex-col items-center"
                  style={{
                    left: FLOW_CENTER_X - (step.type === 'group' ? 140 : 120),
                    top: FLOW_START_Y + i * FLOW_STEP_PITCH,
                    opacity: dragStepId === step.id ? 0.3 : 1,
                  }}
                >
                  {i > 0 && <StepConnector />}
                  {step.type === 'group' ? (
                    <FlowchartGroupView
                      step={step}
                      childSteps={block.steps
                        .filter((s) => s.parentStepId === step.id)
                        .sort((a, b) => a.order - b.order)}
                      selected={selectedIds.includes(step.id)}
                      selectedStepId={selectedStepId}
                      status={executionStatus[step.id] ?? 'idle'}
                      executionStatus={executionStatus}
                      dropTarget={
                        dropTarget?.kind === 'group' &&
                        dropTarget.groupId === step.id
                      }
                      onSelect={(id) => handleSelect(id)}
                      onDelete={handleDeleteStep}
                      onAddChild={() => {
                        setAddStepParent(step.id);
                        setAddStepOpen(true);
                      }}
                      onDragStart={handleDragStart}
                      onRunStep={onRunStep && !running ? onRunStep : undefined}
                    />
                  ) : (
                    <FlowchartStepView
                      step={step}
                      selected={selectedIds.includes(step.id)}
                      status={executionStatus[step.id] ?? 'idle'}
                      onSelect={(id) => handleSelect(id)}
                      onDelete={handleDeleteStep}
                      onDragStart={handleDragStart}
                      onRunStep={onRunStep && !running ? onRunStep : undefined}
                    />
                  )}
                </div>
              ))}

              {/* Drop insert indicator */}
              {insertIndicatorY !== null && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: FLOW_CENTER_X - 120,
                    top: insertIndicatorY,
                    width: 240,
                    height: 3,
                    background: '#3b82f6',
                    borderRadius: 2,
                    boxShadow: '0 0 8px #3b82f6aa',
                  }}
                />
              )}

              {/* Add step button (at end of flow) */}
              <div
                className="absolute flex flex-col items-center"
                style={{
                  left: FLOW_CENTER_X - 60,
                  top:
                    FLOW_START_Y +
                    topLevelFlowSteps.length * FLOW_STEP_PITCH +
                    (topLevelFlowSteps.length > 0 ? 0 : 0),
                }}
              >
                {topLevelFlowSteps.length > 0 && <StepConnector />}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddStepParent(undefined);
                    setAddStepOpen(true);
                  }}
                  className="rounded-lg border border-dashed border-fl-border-strong bg-transparent px-4 py-2 font-mono text-[10px] text-fl-text-faint transition-colors hover:border-[#3b82f6] hover:text-[#3b82f6]"
                >
                  + ステップ追加
                </button>
              </div>

              {/* Free-area steps */}
              {freeSteps.map((step) => (
                <div
                  key={step.id}
                  className="absolute"
                  style={{
                    left: (step.position?.x ?? FLOW_CENTER_X + 250) - 120,
                    top: step.position?.y ?? 100,
                    opacity: dragStepId === step.id ? 0.3 : 0.75,
                  }}
                >
                  <FlowchartStepView
                    step={step}
                    selected={selectedIds.includes(step.id)}
                    status={executionStatus[step.id] ?? 'idle'}
                    onSelect={(id) => handleSelect(id)}
                    onDelete={handleDeleteStep}
                    onDragStart={handleDragStart}
                    onRunStep={onRunStep && !running ? onRunStep : undefined}
                  />
                  {/* Free-area badge */}
                  <div
                    className="pointer-events-none absolute -top-3 right-0 rounded-full px-1.5 py-px font-mono text-[7px] font-bold"
                    style={{
                      background: '#94a3b822',
                      color: '#94a3b8',
                    }}
                  >
                    FREE
                  </div>
                </div>
              ))}

              {/* Rubber-band selection rectangle */}
              {rubberBand && (
                <div
                  className="pointer-events-none absolute rounded-sm"
                  style={{
                    left: Math.min(rubberBand.x0, rubberBand.x1),
                    top: Math.min(rubberBand.y0, rubberBand.y1),
                    width: Math.abs(rubberBand.x1 - rubberBand.x0),
                    height: Math.abs(rubberBand.y1 - rubberBand.y0),
                    background: '#3b82f615',
                    border: '1px solid #3b82f666',
                  }}
                />
              )}
            </div>
          </div>
        </FlowchartContextMenu>

        {/* Right: step inspector */}
        <StepInspector
          step={selectedStep}
          block={block}
          nodeManifest={nodeManifest}
          scenarioVariables={scenarioVariables}
          subroutines={subroutines}
          onUpdateStep={handleUpdateStep}
        />
      </div>

      {/* Drag ghost */}
      {dragStep && ghostPos && (
        <StepGhost step={dragStep} x={ghostPos.x} y={ghostPos.y} />
      )}

      <AddStepModal
        open={addStepOpen}
        onOpenChange={setAddStepOpen}
        blockLabel={block.label}
        nextOrder={nextOrder}
        parentStepId={addStepParent}
        subroutines={subroutines}
        onAdd={handleAddStep}
      />
    </div>
  );
}
