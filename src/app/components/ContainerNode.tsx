import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Repeat, GitBranch, Layers, Box } from 'lucide-react';
import type { Step } from '../types';
import { STEP_META } from '../types';
import type { BlockStatus } from '../engine';

export interface ContainerNodeData {
  step: Step;
  status: BlockStatus;
  width: number;
  height: number;
  childCount: number;
  onDelete: (stepId: string) => void;
  onAddChild: (parentId: string) => void;
  [key: string]: unknown;
}

const ICONS: Record<string, React.ReactNode> = {
  loop: <Repeat className="h-3 w-3" />,
  branch: <GitBranch className="h-3 w-3" />,
  switch: <Layers className="h-3 w-3" />,
  group: <Box className="h-3 w-3" />,
};

/**
 * Container node for control-flow steps (loop/branch/switch/group).
 * Acts as a ReactFlow parent — its children are rendered as separate
 * ReactFlow nodes positioned relative to this one.
 */
export const ContainerNode = memo(function ContainerNode({
  data,
  selected,
}: NodeProps) {
  const d = data as unknown as ContainerNodeData;
  const meta = STEP_META[d.step.type];
  const icon = ICONS[d.step.type] ?? <Box className="h-3 w-3" />;

  const isRunning = d.status === 'running';
  const isError = d.status === 'error';

  const borderColor = isError
    ? '#f43f5e'
    : isRunning
      ? meta.color
      : selected
        ? meta.color
        : `${meta.color}66`;

  const headerBg = `${meta.color}1f`;

  return (
    <div
      className="relative rounded-xl backdrop-blur-sm"
      style={{
        width: d.width,
        height: d.height,
        border: `2px ${selected ? 'solid' : 'dashed'} ${borderColor}`,
        background: `${meta.color}0a`,
        boxShadow:
          isRunning
            ? `0 0 20px ${meta.color}55`
            : selected
              ? `0 0 0 1px ${meta.color}66`
              : 'none',
      }}
    >
      {/* Target handle — accept incoming control flow */}
      <Handle
        type="target"
        position={Position.Left}
        id="__container__"
        style={{
          background: meta.color,
          width: 9,
          height: 9,
          border: '2px solid var(--fl-bg)',
        }}
      />

      {/* Header (drag handle) */}
      <div
        className="drag-handle absolute left-0 right-0 top-0 flex cursor-grab items-center gap-1.5 rounded-t-[10px] px-3 py-1.5 active:cursor-grabbing"
        style={{
          background: headerBg,
          borderBottom: `1px solid ${meta.color}33`,
        }}
      >
        <span style={{ color: meta.color }}>{icon}</span>
        <span
          className="font-mono text-[10px] font-bold tracking-wider"
          style={{ color: meta.color }}
        >
          {meta.label.toUpperCase()}
        </span>
        <span
          className="ml-1 truncate font-mono text-[10px] text-fl-text-muted"
          title={d.step.label}
        >
          {d.step.label}
        </span>
        <span
          className="ml-auto rounded-full px-1.5 py-px font-mono text-[8px] font-bold"
          style={{ background: `${meta.color}22`, color: meta.color }}
        >
          {d.childCount}
        </span>
      </div>

      {/* Empty state hint */}
      {d.childCount === 0 && (
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              d.onAddChild(d.step.id);
            }}
            className="rounded-md border border-dashed border-fl-border-strong bg-fl-panel-2 px-3 py-1 font-mono text-[9px] text-fl-text-faint transition-colors hover:border-[#3b82f6] hover:text-[#3b82f6]"
          >
            + 子ステップ追加
          </button>
        </div>
      )}

      {/* Source handle — emit control flow out */}
      <Handle
        type="source"
        position={Position.Right}
        id="__container__"
        style={{
          background: meta.color,
          width: 9,
          height: 9,
          border: '2px solid var(--fl-bg)',
        }}
      />
    </div>
  );
});
