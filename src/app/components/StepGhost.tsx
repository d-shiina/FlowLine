import { createPortal } from 'react-dom';
import type { Step } from '../types';
import { STEP_META } from '../types';

interface Props {
  step: Step;
  x: number;
  y: number;
}

/**
 * Semi-transparent ghost element shown during step drag.
 * Rendered via portal so it floats above everything.
 */
export function StepGhost({ step, x, y }: Props) {
  const meta = STEP_META[step.type];

  return createPortal(
    <div
      className="pointer-events-none fixed z-[10000] w-[240px] rounded-lg"
      style={{
        left: x,
        top: y,
        background: `${meta.color}33`,
        border: `2px dashed ${meta.color}`,
        boxShadow: `0 0 14px ${meta.color}66, inset 0 0 10px ${meta.color}33`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="flex flex-col gap-0.5 py-2 pl-3 pr-2">
        <div
          className="font-mono text-[8px] font-bold tracking-wider"
          style={{ color: meta.color }}
        >
          {meta.icon} {meta.label.toUpperCase()}
        </div>
        <div
          className="truncate font-mono text-[11px] opacity-80"
          style={{ color: meta.color }}
        >
          {step.label}
        </div>
      </div>
    </div>,
    document.body,
  );
}
