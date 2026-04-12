import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronRight } from 'lucide-react';
import type { Step } from '../types';
import { STEP_META } from '../types';
import type { BlockStatus } from '../engine';
import { FlowchartStepView, StepConnector } from './FlowchartStepView';

interface Props {
  step: Step;
  /** Direct children of this group (sorted by order). */
  childSteps: Step[];
  selected: boolean;
  selectedStepId: string | null;
  status: BlockStatus;
  onSelect: (stepId: string) => void;
  onDelete: (stepId: string) => void;
  onAddChild: () => void;
}

const meta = STEP_META.group;

/**
 * Collapsible group container rendered in the flowchart.
 * Uses Base UI Collapsible for animated expand / collapse.
 * Children are rendered as regular FlowchartStepView cards inside.
 */
export function FlowchartGroupView({
  step,
  childSteps,
  selected,
  selectedStepId,
  onSelect,
  onDelete,
  onAddChild,
}: Props) {
  const borderColor = selected ? meta.color : `${meta.color}55`;

  return (
    <Collapsible.Root defaultOpen className="w-[280px]">
      <div
        className="overflow-hidden rounded-lg transition-colors"
        style={{
          border: `1.5px solid ${borderColor}`,
          background: `${meta.color}08`,
          boxShadow: selected ? `0 0 0 1px ${meta.color}66` : 'none',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(step.id);
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5">
          {/* Collapse trigger */}
          <Collapsible.Trigger
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded transition-colors hover:bg-[#ffffff10]"
            onClick={(e) => e.stopPropagation()}
          >
            <ChevronRight
              className="h-3 w-3 text-fl-text-dim transition-transform data-[panel-open]:rotate-90"
              style={{ color: meta.color }}
            />
          </Collapsible.Trigger>

          {/* Type label */}
          <span
            className="font-mono text-[8px] font-bold tracking-wider"
            style={{ color: meta.color }}
          >
            {meta.icon} {meta.label.toUpperCase()}
          </span>

          {/* Step label */}
          <span
            className="min-w-0 flex-1 truncate font-mono text-[11px] text-fl-text-muted"
            title={step.label}
          >
            {step.label}
          </span>

          {/* Child count badge */}
          <span
            className="flex-shrink-0 rounded-full px-1.5 py-px font-mono text-[8px] font-bold"
            style={{ background: `${meta.color}22`, color: meta.color }}
          >
            {childSteps.length}
          </span>
        </div>

        {/* Collapsible body */}
        <Collapsible.Panel className="overflow-hidden transition-all data-[ending-style]:h-0 data-[starting-style]:h-0">
          <div className="flex flex-col items-center gap-0 border-t border-fl-border px-3 py-3">
            {childSteps.length === 0 ? (
              <div className="font-mono text-[9px] text-fl-text-ghost">
                空のグループ
              </div>
            ) : (
              childSteps.map((child, i) => (
                <div key={child.id} className="flex flex-col items-center">
                  {i > 0 && <StepConnector />}
                  <FlowchartStepView
                    step={child}
                    selected={selectedStepId === child.id}
                    status="idle"
                    onSelect={onSelect}
                    onDelete={onDelete}
                  />
                </div>
              ))
            )}

            {/* Add child step button */}
            {childSteps.length > 0 && <StepConnector />}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddChild();
              }}
              className="rounded border border-dashed border-fl-border-strong bg-transparent px-3 py-1 font-mono text-[9px] text-fl-text-ghost transition-colors hover:border-fl-accent hover:text-fl-accent"
            >
              + 追加
            </button>
          </div>
        </Collapsible.Panel>
      </div>
    </Collapsible.Root>
  );
}
