import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { X } from 'lucide-react';
import type { Block } from '../types';
import type { BlockStatus } from '../engine';

export interface TimelineBlockNodeData {
  block: Block;
  trackColor: string;
  status: BlockStatus;
  isErrorHandler?: boolean;
  onDoubleClick: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  [key: string]: unknown;
}

/**
 * Timeline block node — one task block on a track.
 * Double-click opens the flowchart editor for this block's steps.
 */
export const TimelineBlockNode = memo(function TimelineBlockNode({
  data,
  selected,
}: NodeProps) {
  const d = data as unknown as TimelineBlockNodeData;
  const { block, trackColor, status, isErrorHandler } = d;

  const isRunning = status === 'running';
  const isError = status === 'error';
  const isOk = status === 'ok';
  const isSkipped = status === 'skipped' || status === 'cancelled';

  const accent = isErrorHandler ? '#f43f5e' : trackColor;
  const borderColor = isError
    ? '#ef4444'
    : isRunning
      ? accent
      : selected
        ? accent
        : isOk
          ? `${accent}66`
          : isSkipped
            ? '#94a3b855'
            : `${accent}55`;

  const shadow = isError
    ? '0 0 14px #ef444466'
    : isRunning
      ? `0 0 14px ${accent}aa`
      : selected
        ? `0 0 0 1px ${accent}88`
        : 'none';

  const hasInputs = block.inputs && Object.keys(block.inputs).length > 0;
  const hasOutputs = block.outputs && Object.keys(block.outputs).length > 0;
  const stepCount = block.steps?.length ?? 0;

  return (
    <div
      className="relative w-[84px] cursor-pointer select-none overflow-hidden rounded-lg transition-colors"
      style={{
        height: 56,
        border: `1.5px ${isSkipped ? 'dashed' : 'solid'} ${borderColor}`,
        background: `${accent}14`,
        boxShadow: shadow,
        opacity: isSkipped ? 0.55 : 1,
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        d.onDoubleClick(block.id);
      }}
    >
      {/* Target handle (left, accepts connections) */}
      {hasInputs && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            background: accent,
            width: 6,
            height: 6,
            border: `1.5px solid var(--fl-panel-2)`,
            top: '50%',
          }}
        />
      )}

      <div className="flex h-full flex-col justify-center gap-0.5 px-2">
        <div
          className="font-mono text-[8px] font-bold tracking-wider"
          style={{ color: accent }}
        >
          ▶ TASK
        </div>
        <div
          className="truncate font-mono text-[10px] text-fl-text-muted"
          title={block.label}
        >
          {block.label}
        </div>
      </div>

      {/* Step count badge */}
      {stepCount > 0 && !isRunning && !isOk && !isError && !isSkipped && (
        <span
          className="pointer-events-none absolute bottom-0.5 right-1 font-mono text-[7px] font-bold"
          style={{ color: `${accent}88` }}
        >
          {stepCount}s
        </span>
      )}

      {/* Status indicator */}
      {(isRunning || isOk || isError || isSkipped) && (
        <span
          className="pointer-events-none absolute right-1 top-1 flex h-2.5 items-center justify-center rounded px-0.5 font-mono text-[7px] font-bold leading-none"
          style={{
            background: isError
              ? '#ef4444'
              : isRunning
                ? accent
                : isOk
                  ? `${accent}66`
                  : '#94a3b866',
            color: isError || isRunning ? '#fff' : 'var(--fl-text)',
          }}
        >
          {isRunning ? '●' : isOk ? '✓' : isError ? '✕' : '–'}
        </span>
      )}

      {/* Delete button on hover */}
      <button
        type="button"
        className="absolute right-0.5 top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500/80 text-[8px] text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          d.onDelete(block.id);
        }}
        title="削除"
      >
        <X className="h-2 w-2" />
      </button>

      {/* Source handle (right, emits connections) */}
      {hasOutputs && (
        <Handle
          type="source"
          position={Position.Right}
          style={{
            background: accent,
            width: 6,
            height: 6,
            border: `1.5px solid var(--fl-panel-2)`,
            top: '50%',
          }}
        />
      )}
    </div>
  );
});
