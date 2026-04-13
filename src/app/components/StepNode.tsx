import { memo, useMemo } from 'react';
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
 * Renders one Handle per port (input on the left, output on the right)
 * so the user can wire individual port-to-port connections via drag.
 *
 * Handle ID format: "${portName}".
 */
export const StepNode = memo(function StepNode({
  data,
  selected,
}: NodeProps) {
  const d = data as unknown as StepNodeData;
  const node = d.nodeManifest;

  // Compute port lists from manifest.
  const inPorts = useMemo(
    () =>
      node
        ? Object.entries(node.ports).filter(([, def]) => def.kind === 'in')
        : [],
    [node],
  );
  const outPorts = useMemo(
    () =>
      node
        ? Object.entries(node.ports).filter(([, def]) => def.kind === 'out')
        : [],
    [node],
  );

  return (
    <div className="relative">
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

      {/* In-port handles (left side, distributed vertically) */}
      {inPorts.length > 0 ? (
        inPorts.map(([name], i) => (
          <Handle
            key={`in-${name}`}
            type="target"
            position={Position.Left}
            id={name}
            style={{
              top: `${30 + i * 14}px`,
              background: '#6366f1',
              width: 9,
              height: 9,
              border: '2px solid var(--fl-panel-2)',
            }}
            title={`in: ${name}`}
          />
        ))
      ) : (
        <Handle
          type="target"
          position={Position.Left}
          id="__default__"
          style={{
            background: '#6366f1',
            width: 9,
            height: 9,
            border: '2px solid var(--fl-panel-2)',
          }}
        />
      )}

      {/* Out-port handles (right side) */}
      {outPorts.length > 0 ? (
        outPorts.map(([name], i) => (
          <Handle
            key={`out-${name}`}
            type="source"
            position={Position.Right}
            id={name}
            style={{
              top: `${30 + i * 14}px`,
              background: '#6366f1',
              width: 9,
              height: 9,
              border: '2px solid var(--fl-panel-2)',
            }}
            title={`out: ${name}`}
          />
        ))
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id="__default__"
          style={{
            background: '#6366f1',
            width: 9,
            height: 9,
            border: '2px solid var(--fl-panel-2)',
          }}
        />
      )}
    </div>
  );
});
