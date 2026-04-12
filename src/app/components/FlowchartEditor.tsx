import { useState } from 'react';
import type { Block, Step, Subroutine } from '../types';
import type { NodeManifestEntry } from '../../globals';
import { Breadcrumb } from './Breadcrumb';
import { FlowchartStepView, StepConnector } from './FlowchartStepView';
import { AddStepModal } from './AddStepModal';

interface Props {
  block: Block;
  trackName: string;
  trackColor: string;
  scenarioName: string;
  subroutines: Subroutine[];
  nodeManifest: NodeManifestEntry[];
  scenarioVariables: Record<string, unknown>;
  onBack: () => void;
  onUpdateBlock: (patch: Partial<Block>) => void;
  onCreateVariable: (key: string, value: unknown) => void;
}

/**
 * Vertical flowchart editor for a single Block's internal steps.
 *
 * Renders top-level steps (no parentStepId) as a vertical list
 * connected by arrow connectors. Control-flow steps (loop / branch
 * / switch) are shown as cards but their children are not yet
 * rendered inline — that comes in Phase 5.
 *
 * The Inspector integration is deferred to Phase 3; for now step
 * selection is tracked locally but no side panel is shown.
 */
export function FlowchartEditor({
  block,
  trackName,
  trackColor,
  scenarioName,
  subroutines,
  onBack,
  onUpdateBlock,
}: Props) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [addStepOpen, setAddStepOpen] = useState(false);

  const topLevelSteps = block.steps
    .filter((s) => !s.parentStepId)
    .sort((a, b) => a.order - b.order);

  const nextOrder =
    block.steps.length > 0
      ? Math.max(...block.steps.map((s) => s.order)) + 1
      : 0;

  const handleAddStep = (step: Step) => {
    onUpdateBlock({ steps: [...block.steps, step] });
  };

  const handleDeleteStep = (stepId: string) => {
    onUpdateBlock({
      steps: block.steps.filter(
        (s) => s.id !== stepId && s.parentStepId !== stepId,
      ),
    });
    if (selectedStepId === stepId) setSelectedStepId(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb */}
      <div className="flex-shrink-0 border-b border-fl-border bg-fl-panel">
        <Breadcrumb
          segments={[
            { label: scenarioName, onClick: onBack },
            {
              label: trackName,
              onClick: onBack,
            },
            { label: block.label },
          ]}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Step list */}
        <div
          className="fl-scroll flex-1 overflow-y-auto"
          onClick={() => setSelectedStepId(null)}
        >
          <div className="flex flex-col items-center gap-0 px-8 py-8">
            {/* Track colour indicator */}
            <div
              className="mb-4 flex items-center gap-2 font-mono text-[10px] font-bold"
              style={{ color: trackColor }}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: trackColor }}
              />
              {block.label}
            </div>

            {topLevelSteps.length === 0 ? (
              <div className="rounded-lg border border-dashed border-fl-border-strong bg-fl-panel-2 px-6 py-4 text-center font-mono text-[10px] text-fl-text-faint">
                まだステップがありません
              </div>
            ) : (
              topLevelSteps.map((step, i) => (
                <div key={step.id} className="flex flex-col items-center">
                  {i > 0 && <StepConnector />}
                  <FlowchartStepView
                    step={step}
                    selected={selectedStepId === step.id}
                    status="idle"
                    onSelect={setSelectedStepId}
                    onDelete={handleDeleteStep}
                  />
                </div>
              ))
            )}

            {/* Add step button */}
            {topLevelSteps.length > 0 && <StepConnector />}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAddStepOpen(true);
              }}
              className="rounded-lg border border-dashed border-fl-border-strong bg-transparent px-4 py-2 font-mono text-[10px] text-fl-text-faint transition-colors hover:border-[#3b82f6] hover:text-[#3b82f6]"
            >
              + ステップ追加
            </button>
          </div>
        </div>
      </div>

      <AddStepModal
        open={addStepOpen}
        onOpenChange={setAddStepOpen}
        blockLabel={block.label}
        nextOrder={nextOrder}
        subroutines={subroutines}
        onAdd={handleAddStep}
      />
    </div>
  );
}
