import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Step } from '../types';
import type { BlockStatus } from '../engine';
import type { NodeManifestEntry } from '../../globals';
import { FlowchartStepView } from './FlowchartStepView';

export interface StepNodeData {
  step: Step;
  status: BlockStatus;
  nodeManifest?: NodeManifestEntry;
  scenarioVariables: Record<string, unknown>;
  onDelete: (stepId: string) => void;
  onUpdate: (stepId: string, patch: Partial<Step>) => void;
  onRunStep?: (stepId: string) => void;
  [key: string]: unknown;
}

/**
 * ReactFlow custom node that wraps FlowchartStepView.
 * Adds connection handles on left (target) and right (source).
 */
export const StepNode = memo(function StepNode({
  data,
  selected,
}: NodeProps) {
  const d = data as unknown as StepNodeData;
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#3b82f6',
          width: 8,
          height: 8,
          border: '2px solid var(--fl-panel-2)',
        }}
      />
      <FlowchartStepView
        step={d.step}
        selected={!!selected}
        status={d.status}
        nodeManifest={d.nodeManifest}
        scenarioVariables={d.scenarioVariables}
        onDelete={d.onDelete}
        onUpdate={d.onUpdate}
        onRunStep={d.onRunStep}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#3b82f6',
          width: 8,
          height: 8,
          border: '2px solid var(--fl-panel-2)',
        }}
      />
    </>
  );
});
