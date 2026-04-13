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
 * ReactFlow custom node wrapping FlowchartStepView.
 *
 * Per-port Handles are rendered INSIDE FlowchartStepView at the same
 * DOM position as the visible port dots, so the user can drag from
 * exactly where they see the port. This component only adds a default
 * Handle pair for nodes that have no manifest (e.g. wait, subroutine
 * without a nodeId), giving them a generic connection point.
 */
export const StepNode = memo(function StepNode({
  data,
  selected,
}: NodeProps) {
  const d = data as unknown as StepNodeData;
  const node = d.nodeManifest;
  const hasPorts = !!node && Object.keys(node.ports).length > 0;

  // Exec (control flow) handle styling — Bolt/Blueprint inspired.
  // Square white pegs at the top of the node, separate from the
  // round data-port handles which live inside the body.
  const execStyle: React.CSSProperties = {
    top: 16,
    width: 14,
    height: 14,
    borderRadius: 3,
    background: '#e2e8f0',
    border: '2px solid #475569',
    zIndex: 10,
  };

  return (
    <div className="relative">
      {/* Exec in (left) — control flow input */}
      <Handle
        type="target"
        position={Position.Left}
        id="__exec__"
        style={{ ...execStyle, left: -8 }}
        title="exec in"
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

      {/* Exec out (right) — control flow output */}
      <Handle
        type="source"
        position={Position.Right}
        id="__exec__"
        style={{ ...execStyle, right: -8 }}
        title="exec out"
      />

      {/* Fallback default handles when the node has no port definitions. */}
      {!hasPorts && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="__default__"
            style={{
              top: 60,
              background: '#6366f1',
              width: 11,
              height: 11,
              border: '2px solid var(--fl-panel-2)',
            }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="__default__"
            style={{
              top: 60,
              background: '#6366f1',
              width: 11,
              height: 11,
              border: '2px solid var(--fl-panel-2)',
            }}
          />
        </>
      )}
    </div>
  );
});
