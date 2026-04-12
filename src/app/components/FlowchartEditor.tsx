import { useCallback, useMemo, useRef, useState } from 'react';
import type { Block, Step, Subroutine } from '../types';
import type { BlockStatus } from '../engine';
import type { NodeManifestEntry } from '../../globals';
import { Breadcrumb } from './Breadcrumb';
import { FlowchartStepView, StepConnector } from './FlowchartStepView';
import { FlowchartGroupView } from './FlowchartGroupView';
import { AddStepModal } from './AddStepModal';
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
  executionStatus: Record<string, BlockStatus>;
  running: boolean;
  onBack: () => void;
  onUpdateBlock: (patch: Partial<Block>) => void;
  onCreateVariable: (key: string, value: unknown) => void;
  onRunStep?: (stepId: string) => void;
  onRunFromStep?: (stepId: string) => void;
  onRunBlock?: () => void;
}

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
  const [addStepParent, setAddStepParent] = useState<string | undefined>();

  // Drag state
  const [dragStepId, setDragStepId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null);
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  const selectedStepId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedStep = selectedStepId
    ? (block.steps.find((s) => s.id === selectedStepId) ?? null)
    : null;

  const topLevelSteps = block.steps
    .filter((s) => !s.parentStepId)
    .sort((a, b) => a.order - b.order);

  const nextOrder =
    block.steps.length > 0
      ? Math.max(...block.steps.map((s) => s.order)) + 1
      : 0;

  const manifestMap = useMemo(() => {
    const m = new Map<string, NodeManifestEntry>();
    for (const n of nodeManifest) m.set(n.id, n);
    return m;
  }, [nodeManifest]);

  // ── Mutations ──────────────────────────────

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
          block.steps.filter((s) => s.id !== stepId && s.parentStepId !== stepId),
        ),
      });
      setSelectedIds((prev) => prev.filter((id) => id !== stepId));
      setDragStepId(null);
      setGhostPos(null);
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
    const dupes: Step[] = [];
    for (const s of block.steps) {
      if (!ids.has(s.id)) continue;
      dupes.push({
        ...s,
        id: uid('s'),
        label: `${s.label} (copy)`,
        order: nextOrder + dupes.length,
      });
    }
    onUpdateBlock({ steps: [...block.steps, ...dupes] });
    setSelectedIds(dupes.map((d) => d.id));
  }, [selectedIds, block.steps, nextOrder, onUpdateBlock]);

  // ── Selection ──────────────────────────────

  const handleSelect = useCallback(
    (stepId: string, e?: React.MouseEvent) => {
      if (e && (e.ctrlKey || e.metaKey)) {
        setSelectedIds((prev) =>
          prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId],
        );
      } else if (e && e.shiftKey && selectedIds.length > 0) {
        const ids = topLevelSteps.map((s) => s.id);
        const last = ids.indexOf(selectedIds[selectedIds.length - 1]);
        const cur = ids.indexOf(stepId);
        if (last >= 0 && cur >= 0) {
          setSelectedIds(ids.slice(Math.min(last, cur), Math.max(last, cur) + 1));
        } else {
          setSelectedIds([stepId]);
        }
      } else {
        setSelectedIds([stepId]);
      }
    },
    [selectedIds, topLevelSteps],
  );

  // ── Drag & Drop (reorder) ──────────────────

  const applyDropRef = useRef<(stepId: string, insertIdx: number | null, groupId: string | null) => void>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    null as any,
  );

  const handleDragStart = useCallback(
    (stepId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      let didMove = false;
      let lastInsert: number | null = null;
      let lastGroup: string | null = null;

      if (!selectedIds.includes(stepId)) setSelectedIds([stepId]);

      const onMove = (ev: MouseEvent) => {
        if (!didMove && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 4) return;
        didMove = true;
        setDragStepId(stepId);
        setGhostPos({ x: ev.clientX, y: ev.clientY });

        // Hit-test: find which step card the cursor is over using DOM elements
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const stepEl = el?.closest<HTMLElement>('[data-step-id]');
        const groupEl = el?.closest<HTMLElement>('[data-group-id]');

        if (groupEl && groupEl.dataset.groupId !== stepId) {
          lastGroup = groupEl.dataset.groupId!;
          lastInsert = null;
          setDropGroupId(lastGroup);
          setDropInsertIndex(null);
        } else if (stepEl && stepEl.dataset.stepId !== stepId) {
          const rect = stepEl.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const idx = topLevelSteps.findIndex((s) => s.id === stepEl.dataset.stepId);
          if (idx >= 0) {
            lastInsert = ev.clientY < midY ? idx : idx + 1;
            lastGroup = null;
            setDropInsertIndex(lastInsert);
            setDropGroupId(null);
          }
        } else {
          // Below all steps — insert at end
          lastInsert = topLevelSteps.length;
          lastGroup = null;
          setDropInsertIndex(lastInsert);
          setDropGroupId(null);
        }
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('keydown', onKey);
        if (didMove) applyDropRef.current(stepId, lastInsert, lastGroup);
        setDragStepId(null);
        setGhostPos(null);
        setDropInsertIndex(null);
        setDropGroupId(null);
      };

      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          window.removeEventListener('keydown', onKey);
          setDragStepId(null);
          setGhostPos(null);
          setDropInsertIndex(null);
          setDropGroupId(null);
        }
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('keydown', onKey);
    },
    [selectedIds, topLevelSteps],
  );

  const applyDrop = useCallback(
    (stepId: string, insertIdx: number | null, groupId: string | null) => {
      let updated = [...block.steps];

      if (groupId) {
        // Drop into group
        const childCount = updated.filter((s) => s.parentStepId === groupId).length;
        updated = updated.map((s) =>
          s.id === stepId ? { ...s, parentStepId: groupId, order: childCount } : s,
        );
      } else if (insertIdx !== null) {
        // Reorder in flow
        const flow = updated.filter((s) => !s.parentStepId && s.id !== stepId).sort((a, b) => a.order - b.order);
        const step = updated.find((s) => s.id === stepId);
        if (step) {
          flow.splice(insertIdx, 0, { ...step, parentStepId: undefined });
          const orderMap = new Map<string, number>();
          flow.forEach((s, i) => orderMap.set(s.id, i));
          updated = updated.map((s) =>
            orderMap.has(s.id) ? { ...s, order: orderMap.get(s.id)!, parentStepId: undefined } : s,
          );
        }
      }

      onUpdateBlock({ steps: reorderSteps(updated) });
    },
    [block.steps, onUpdateBlock],
  );
  applyDropRef.current = applyDrop;

  // ── Context menu ───────────────────────────

  const handleGroup = useCallback(() => {
    if (selectedIds.length < 2) return;
    const groupId = uid('s');
    const sel = new Set(selectedIds);
    const selectedSteps = block.steps.filter((s) => sel.has(s.id));
    const minOrder = Math.min(...selectedSteps.map((s) => s.order));
    let childOrder = 0;
    const updated = block.steps
      .filter((s) => !sel.has(s.id))
      .concat([{ id: groupId, type: 'group' as const, label: 'グループ', order: minOrder }])
      .concat(selectedSteps.map((s) => ({ ...s, parentStepId: groupId, order: childOrder++ })));
    onUpdateBlock({ steps: reorderSteps(updated) });
    setSelectedIds([groupId]);
  }, [selectedIds, block.steps, onUpdateBlock]);

  const handleUngroup = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const group = block.steps.find((s) => s.id === selectedIds[0]);
    if (!group || group.type !== 'group') return;
    const children = block.steps.filter((s) => s.parentStepId === group.id).sort((a, b) => a.order - b.order);
    let ord = group.order;
    const updated = block.steps
      .filter((s) => s.id !== group.id && s.parentStepId !== group.id)
      .concat(children.map((s) => ({ ...s, parentStepId: undefined, order: ord++ })));
    onUpdateBlock({ steps: reorderSteps(updated) });
    setSelectedIds(children.map((s) => s.id));
  }, [selectedIds, block.steps, onUpdateBlock]);

  const isGroupSelected =
    selectedIds.length === 1 && block.steps.find((s) => s.id === selectedIds[0])?.type === 'group';

  // ── Render ─────────────────────────────────

  const dragStep = dragStepId ? block.steps.find((s) => s.id === dragStepId) : null;

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

      <div className="flex flex-1 overflow-hidden">
        {/* Step list */}
        <FlowchartContextMenu
          selectedIds={selectedIds}
          hasFlowSteps={selectedIds.length > 0}
          hasFreeSteps={false}
          isGroupSelected={isGroupSelected}
          running={running}
          onGroup={handleGroup}
          onUngroup={handleUngroup}
          onMoveToFree={() => {}}
          onMoveToFlow={() => {}}
          onDuplicate={handleDuplicateSelected}
          onDelete={handleDeleteSelected}
          onRunStep={
            onRunStep && selectedIds.length === 1 ? () => onRunStep(selectedIds[0]) : undefined
          }
          onRunFromHere={
            onRunFromStep && selectedIds.length === 1 ? () => onRunFromStep(selectedIds[0]) : undefined
          }
          onRunBlock={onRunBlock}
        >
          <div
            ref={listRef}
            className="fl-scroll flex-1 overflow-auto"
            onClick={() => setSelectedIds([])}
          >
            <div className="flex min-h-full items-start gap-0 px-6 py-6">
              {/* Track label */}
              <div
                className="mr-4 flex flex-shrink-0 items-center gap-2 self-center font-mono text-[10px] font-bold"
                style={{ color: trackColor }}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: trackColor }} />
                {block.label}
              </div>

              {topLevelSteps.length === 0 ? (
                <div className="self-center rounded-lg border border-dashed border-fl-border-strong bg-fl-panel-2 px-6 py-4 text-center font-mono text-[10px] text-fl-text-faint">
                  まだステップがありません
                </div>
              ) : (
                topLevelSteps.map((step, i) => (
                  <div key={step.id} className="flex flex-shrink-0 items-start" data-step-id={step.id}>
                    {i > 0 && <StepConnector />}
                    {/* Drop insert indicator */}
                    {dropInsertIndex === i && dragStepId !== step.id && (
                      <div className="mr-1 w-[3px] self-stretch rounded-full bg-[#3b82f6]" style={{ boxShadow: '0 0 8px #3b82f6aa' }} />
                    )}
                    {step.type === 'group' ? (
                      <div data-group-id={step.id}>
                        <FlowchartGroupView
                          step={step}
                          childSteps={block.steps.filter((s) => s.parentStepId === step.id).sort((a, b) => a.order - b.order)}
                          selected={selectedIds.includes(step.id)}
                          selectedStepId={selectedStepId}
                          status={executionStatus[step.id] ?? 'idle'}
                          executionStatus={executionStatus}
                          dropTarget={dropGroupId === step.id}
                          scenarioVariables={scenarioVariables}
                          onSelect={(id) => handleSelect(id)}
                          onDelete={handleDeleteStep}
                          onUpdate={handleUpdateStep}
                          onAddChild={() => { setAddStepParent(step.id); setAddStepOpen(true); }}
                          onDragStart={handleDragStart}
                          onRunStep={onRunStep && !running ? onRunStep : undefined}
                          manifestMap={manifestMap}
                        />
                      </div>
                    ) : (
                      <FlowchartStepView
                        step={step}
                        selected={selectedIds.includes(step.id)}
                        status={executionStatus[step.id] ?? 'idle'}
                        nodeManifest={step.nodeId ? manifestMap.get(step.nodeId) : undefined}
                        scenarioVariables={scenarioVariables}
                        onSelect={(id) => handleSelect(id)}
                        onDelete={handleDeleteStep}
                        onUpdate={handleUpdateStep}
                        onDragStart={handleDragStart}
                        onRunStep={onRunStep && !running ? onRunStep : undefined}
                      />
                    )}
                  </div>
                ))
              )}

              {/* Drop at end indicator */}
              {dropInsertIndex === topLevelSteps.length && (
                <div className="ml-1 w-[3px] self-stretch rounded-full bg-[#3b82f6]" style={{ boxShadow: '0 0 8px #3b82f6aa' }} />
              )}

              {/* Add button */}
              {topLevelSteps.length > 0 && <StepConnector />}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddStepParent(undefined);
                  setAddStepOpen(true);
                }}
                className="flex-shrink-0 self-center rounded-lg border border-dashed border-fl-border-strong bg-transparent px-3 py-2 font-mono text-[10px] text-fl-text-faint transition-colors hover:border-[#3b82f6] hover:text-[#3b82f6]"
              >
                + 追加
              </button>
            </div>
          </div>
        </FlowchartContextMenu>
      </div>

      {dragStep && ghostPos && <StepGhost step={dragStep} x={ghostPos.x} y={ghostPos.y} />}

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
