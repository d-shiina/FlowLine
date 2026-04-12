import { useState } from 'react';
import type { Step } from '../types';
import { STEP_META } from '../types';
import type { BlockStatus } from '../engine';

interface Props {
  step: Step;
  selected: boolean;
  status: BlockStatus;
  onSelect: (stepId: string) => void;
  onDelete: (stepId: string) => void;
  /** Called on mousedown to let the parent start a drag. */
  onDragStart?: (stepId: string, e: React.MouseEvent) => void;
}

/**
 * Single step card rendered in the vertical flowchart editor.
 * Control-flow steps (loop/branch/switch) get a slightly different
 * visual treatment (thicker border, type-coloured background tint)
 * but child rendering is handled by FlowchartEditor, not here.
 */
export function FlowchartStepView({
  step,
  selected,
  status,
  onSelect,
  onDelete,
  onDragStart,
}: Props) {
  const [hov, setHov] = useState(false);
  const meta = STEP_META[step.type];
  const isControl =
    step.type === 'loop' || step.type === 'branch' || step.type === 'switch';

  const isRunning = status === 'running';
  const isError = status === 'error';
  const isOk = status === 'ok';
  const isSkipped = status === 'skipped' || status === 'cancelled';

  const borderColor = isError
    ? '#ef4444'
    : isRunning
      ? meta.color
      : selected
        ? meta.color
        : isOk
          ? `${meta.color}44`
          : isSkipped
            ? '#94a3b855'
            : `${meta.color}${hov ? 'cc' : '55'}`;

  const background = isError
    ? '#ef44441f'
    : isRunning
      ? `${meta.color}33`
      : isOk
        ? `${meta.color}10`
        : isSkipped
          ? 'transparent'
          : isControl
            ? `${meta.color}14`
            : hov
              ? `${meta.color}18`
              : `${meta.color}0c`;

  const shadow = isError
    ? '0 0 14px #ef444466'
    : isRunning
      ? `0 0 14px ${meta.color}88`
      : selected
        ? `0 0 0 1px ${meta.color}66`
        : 'none';

  return (
    <div
      className="relative w-[240px] cursor-pointer select-none overflow-hidden rounded-lg transition-colors"
      style={{
        border: `${isControl ? 2 : 1.5}px ${isSkipped ? 'dashed' : 'solid'} ${borderColor}`,
        background,
        boxShadow: shadow,
        opacity: isSkipped ? 0.55 : 1,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onMouseDown={(e) => {
        if (e.button === 0 && onDragStart) {
          onDragStart(step.id, e);
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(step.id);
      }}
    >
      {/* Left colour bar */}
      <div
        className="absolute bottom-0 left-0 top-0 w-1"
        style={{ background: meta.color }}
      />

      <div className="flex flex-col gap-0.5 py-2 pl-3 pr-2">
        <div
          className="font-mono text-[8px] font-bold tracking-wider"
          style={{ color: meta.color }}
        >
          {meta.icon} {meta.label.toUpperCase()}
        </div>
        <div
          className="truncate font-mono text-[11px]"
          style={{
            color: isSkipped
              ? 'var(--fl-text-ghost)'
              : isError
                ? '#ef4444'
                : isOk
                  ? 'var(--fl-text-faint)'
                  : 'var(--fl-text-muted)',
          }}
          title={step.label}
        >
          {step.label}
        </div>
      </div>

      {/* Status indicator */}
      {!hov && (isRunning || isOk || isError || isSkipped) && (
        <span
          className="pointer-events-none absolute right-1.5 top-1.5 flex h-3 items-center justify-center rounded px-1 font-mono text-[8px] font-bold leading-none"
          style={{
            background: isError
              ? '#ef4444'
              : isRunning
                ? meta.color
                : isOk
                  ? `${meta.color}66`
                  : '#94a3b866',
            color: isError || isRunning ? '#fff' : 'var(--fl-text)',
          }}
        >
          {isRunning ? '●' : isOk ? '✓' : isError ? '✕' : '–'}
        </span>
      )}

      {/* Delete button on hover */}
      {hov && (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] text-white"
          onMouseDown={(e) => {
            e.stopPropagation();
            onDelete(step.id);
          }}
          aria-label="削除"
        >
          x
        </button>
      )}
    </div>
  );
}

/** Vertical connector line between steps. */
export function StepConnector() {
  return (
    <div className="flex w-[240px] justify-center">
      <div
        className="h-4 w-0.5"
        style={{ background: 'var(--fl-border)' }}
      />
    </div>
  );
}
