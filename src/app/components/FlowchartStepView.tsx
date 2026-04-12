import { useState } from 'react';
import type { Step } from '../types';
import { STEP_META } from '../types';
import type { BlockStatus } from '../engine';
import type { NodeManifestEntry } from '../../globals';

interface Props {
  step: Step;
  selected: boolean;
  status: BlockStatus;
  nodeManifest?: NodeManifestEntry;
  onSelect: (stepId: string) => void;
  onDelete: (stepId: string) => void;
  onDragStart?: (stepId: string, e: React.MouseEvent) => void;
  onRunStep?: (stepId: string) => void;
}

/** Derive a short icon from the category name. No hardcoded map needed. */
function catIcon(category?: string): string {
  if (!category) return '▶';
  // Use the first letter uppercased as a simple badge
  return category.charAt(0).toUpperCase();
}

export function FlowchartStepView({
  step,
  selected,
  status,
  nodeManifest: node,
  onSelect,
  onDelete,
  onDragStart,
  onRunStep,
}: Props) {
  const [hov, setHov] = useState(false);
  const meta = STEP_META[step.type];
  const isControl =
    step.type === 'loop' || step.type === 'branch' || step.type === 'switch';

  const isRunning = status === 'running';
  const isError = status === 'error';
  const isOk = status === 'ok';
  const isSkipped = status === 'skipped' || status === 'cancelled';

  const accent = isError ? '#ef4444' : isRunning ? '#22c55e' : meta.color;

  const borderColor = isError
    ? '#ef4444'
    : isRunning
      ? '#22c55e'
      : selected
        ? meta.color
        : isOk
          ? `${meta.color}44`
          : isSkipped
            ? '#94a3b844'
            : hov
              ? `${meta.color}88`
              : `${meta.color}33`;

  const shadow = isError
    ? '0 0 12px #ef444444'
    : isRunning
      ? '0 0 12px #22c55e44'
      : selected
        ? `0 0 0 1px ${meta.color}44`
        : 'none';

  const icon = node ? catIcon(node.category) : meta.icon;

  const inPorts = node
    ? Object.entries(node.ports).filter(([, d]) => d.kind === 'in')
    : [];
  const outPorts = node
    ? Object.entries(node.ports).filter(([, d]) => d.kind === 'out')
    : [];
  const hasPorts = inPorts.length > 0 || outPorts.length > 0;

  return (
    <div
      className="relative w-[240px] cursor-pointer select-none rounded-lg transition-all"
      style={{
        border: `${isControl ? 2 : 1.5}px ${isSkipped ? 'dashed' : 'solid'} ${borderColor}`,
        background: 'var(--fl-panel-2)',
        boxShadow: shadow,
        opacity: isSkipped ? 0.5 : 1,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onMouseDown={(e) => {
        if (e.button === 0 && onDragStart) onDragStart(step.id, e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(step.id);
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-1.5 rounded-t-[5px] px-2.5 py-1.5"
        style={{ background: `${accent}18` }}
      >
        <span
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold"
          style={{ background: `${accent}22`, color: accent }}
        >
          {icon}
        </span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold"
          style={{ color: accent }}
          title={step.label}
        >
          {step.label}
        </span>

        {/* Status / hover actions */}
        {hov ? (
          <div className="flex gap-0.5">
            {onRunStep && (
              <button
                type="button"
                className="flex h-4 w-4 items-center justify-center rounded text-[7px] text-white"
                style={{ background: '#22c55e' }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onRunStep(step.id);
                }}
              >
                ▶
              </button>
            )}
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded bg-red-500/80 text-[8px] text-white"
              onMouseDown={(e) => {
                e.stopPropagation();
                onDelete(step.id);
              }}
            >
              ✕
            </button>
          </div>
        ) : (isRunning || isOk || isError || isSkipped) ? (
          <span
            className="rounded px-1 py-px text-[7px] font-bold"
            style={{
              background: isError ? '#ef4444' : isRunning ? '#22c55e' : isOk ? `${meta.color}44` : '#94a3b844',
              color: isError || isRunning ? '#fff' : 'var(--fl-text-dim)',
            }}
          >
            {isRunning ? '●' : isOk ? '✓' : isError ? '✕' : '–'}
          </span>
        ) : null}
      </div>

      {/* Ports */}
      {hasPorts && (
        <div className="flex gap-4 px-2.5 py-1.5">
          {/* IN column */}
          {inPorts.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {inPorts.map(([name]) => {
                const bound = !!step.bindings?.[name];
                return (
                  <div key={name} className="flex items-center gap-1">
                    <span
                      className="inline-block h-[5px] w-[5px] rounded-full"
                      style={{
                        background: bound ? accent : 'transparent',
                        border: `1.5px solid ${bound ? accent : '#94a3b866'}`,
                      }}
                    />
                    <span className="font-mono text-[9px] text-fl-text-dim">{name}</span>
                  </div>
                );
              })}
            </div>
          )}
          {/* Spacer */}
          <div className="flex-1" />
          {/* OUT column */}
          {outPorts.length > 0 && (
            <div className="flex flex-col items-end gap-0.5">
              {outPorts.map(([name]) => {
                const bound = !!step.bindings?.[name];
                return (
                  <div key={name} className="flex items-center gap-1">
                    <span className="font-mono text-[9px] text-fl-text-dim">{name}</span>
                    <span
                      className="inline-block h-[5px] w-[5px] rounded-full"
                      style={{
                        background: bound ? accent : 'transparent',
                        border: `1.5px solid ${bound ? accent : '#94a3b866'}`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* No node hint */}
      {!node && !isControl && step.type !== 'group' && (
        <div className="px-2.5 pb-1.5 font-mono text-[8px] text-fl-text-ghost">
          ノード未設定
        </div>
      )}

      {/* Control flow type badge */}
      {isControl && (
        <div className="px-2.5 pb-1.5">
          <span
            className="font-mono text-[8px] font-bold uppercase tracking-wider"
            style={{ color: `${meta.color}88` }}
          >
            {meta.label}
          </span>
        </div>
      )}
    </div>
  );
}

/** Vertical connector line between steps. */
export function StepConnector() {
  return (
    <div className="flex w-[240px] justify-center">
      <div className="h-4 w-0.5" style={{ background: 'var(--fl-border)' }} />
    </div>
  );
}
