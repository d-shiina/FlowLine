import { useState } from 'react';
import type { Step } from '../types';
import { STEP_META } from '../types';
import type { BlockStatus } from '../engine';
import type { NodeManifestEntry, NodePortDef } from '../../globals';

interface Props {
  step: Step;
  selected: boolean;
  status: BlockStatus;
  /** Node manifest entry for this step (if a node is assigned). */
  nodeManifest?: NodeManifestEntry;
  onSelect: (stepId: string) => void;
  onDelete: (stepId: string) => void;
  onDragStart?: (stepId: string, e: React.MouseEvent) => void;
  onRunStep?: (stepId: string) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  browser: '🌐',
  debug: '🔧',
  desktop: '🖥',
  file: '📁',
  http: '🔗',
  email: '✉',
  excel: '📊',
  custom: '⚙',
};

/**
 * Blender-inspired node card for the flowchart editor.
 *
 * Structure:
 * ┌─ Header (category icon + label + actions) ──────┐
 * │  nodeId                                          │
 * ├──────────────────────────────────────────────────┤
 * │  ● url          (in)                             │
 * │                          (out) browser ●         │
 * │                          (out) title   ●         │
 * └──────────────────────────────────────────────────┘
 */
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

  const accentColor = isError
    ? '#ef4444'
    : isRunning
      ? '#22c55e'
      : meta.color;

  const borderColor = isError
    ? '#ef4444'
    : isRunning
      ? '#22c55e'
      : selected
        ? meta.color
        : isOk
          ? `${meta.color}44`
          : isSkipped
            ? '#94a3b855'
            : `${meta.color}${hov ? '88' : '44'}`;

  const headerBg = isError
    ? '#ef444433'
    : isRunning
      ? '#22c55e33'
      : `${meta.color}22`;

  const shadow = isError
    ? '0 0 12px #ef444455'
    : isRunning
      ? '0 0 12px #22c55e55'
      : selected
        ? `0 0 0 1px ${meta.color}55`
        : 'none';

  const catIcon = node
    ? CATEGORY_ICONS[node.category] ?? CATEGORY_ICONS.custom
    : meta.icon;

  const inPorts = node
    ? Object.entries(node.ports).filter(([, d]) => d.kind === 'in')
    : [];
  const outPorts = node
    ? Object.entries(node.ports).filter(([, d]) => d.kind === 'out')
    : [];
  const hasPorts = inPorts.length > 0 || outPorts.length > 0;

  // Build port rows: pair in/out ports side by side.
  const maxRows = Math.max(inPorts.length, outPorts.length);

  return (
    <div
      className="relative w-[260px] cursor-pointer select-none overflow-hidden rounded-lg transition-all"
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
      {/* ── Header ── */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5"
        style={{ background: headerBg }}
      >
        <span className="text-[11px]">{catIcon}</span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold"
          style={{ color: accentColor }}
          title={step.label}
        >
          {step.label}
        </span>

        {/* Status badge */}
        {!hov && (isRunning || isOk || isError || isSkipped) && (
          <span
            className="flex h-4 items-center rounded px-1 font-mono text-[8px] font-bold leading-none"
            style={{
              background: isError
                ? '#ef4444'
                : isRunning
                  ? '#22c55e'
                  : isOk
                    ? `${meta.color}55`
                    : '#94a3b855',
              color: isError || isRunning ? '#fff' : 'var(--fl-text)',
            }}
          >
            {isRunning ? '実行中' : isOk ? '完了' : isError ? 'エラー' : 'skip'}
          </span>
        )}

        {/* Hover actions */}
        {hov && (
          <div className="flex gap-0.5">
            {onRunStep && (
              <button
                type="button"
                className="flex h-4 w-4 items-center justify-center rounded text-[8px] text-white"
                style={{ background: '#22c55e' }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onRunStep(step.id);
                }}
                title="実行"
              >
                ▶
              </button>
            )}
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded bg-red-500/80 text-[9px] text-white"
              onMouseDown={(e) => {
                e.stopPropagation();
                onDelete(step.id);
              }}
              title="削除"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ── Node ID subtitle ── */}
      {node && (
        <div className="border-t border-fl-border px-2.5 py-0.5">
          <span className="font-mono text-[8px] text-fl-text-ghost">
            {node.id} · v{node.version}
          </span>
        </div>
      )}
      {!node && step.type !== 'action' && step.type !== 'wait' && (
        <div className="border-t border-fl-border px-2.5 py-0.5">
          <span
            className="font-mono text-[8px] font-bold uppercase tracking-wider"
            style={{ color: `${meta.color}88` }}
          >
            {meta.label}
          </span>
        </div>
      )}

      {/* ── Port rows (Blender-style) ── */}
      {hasPorts && (
        <div className="border-t border-fl-border">
          {Array.from({ length: maxRows }, (_, i) => {
            const inPort = inPorts[i];
            const outPort = outPorts[i];
            return (
              <div
                key={i}
                className="flex items-center justify-between px-1 py-[2px]"
              >
                {/* In port */}
                {inPort ? (
                  <PortLabel
                    name={inPort[0]}
                    def={inPort[1]}
                    side="in"
                    color={accentColor}
                    bound={!!step.bindings?.[inPort[0]]}
                  />
                ) : (
                  <span />
                )}
                {/* Out port */}
                {outPort ? (
                  <PortLabel
                    name={outPort[0]}
                    def={outPort[1]}
                    side="out"
                    color={accentColor}
                    bound={!!step.bindings?.[outPort[0]]}
                  />
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No node assigned hint */}
      {!node && (step.type === 'action' || step.type === 'wait') && (
        <div className="border-t border-fl-border px-2.5 py-1.5">
          <span className="font-mono text-[8px] text-fl-text-ghost">
            ノード未設定
          </span>
        </div>
      )}
    </div>
  );
}

/** Single port indicator with dot + label. */
function PortLabel({
  name,
  def,
  side,
  color,
  bound,
}: {
  name: string;
  def: NodePortDef;
  side: 'in' | 'out';
  color: string;
  bound: boolean;
}) {
  const dotColor = bound ? color : '#94a3b855';
  return (
    <div
      className={`flex items-center gap-1 ${side === 'out' ? 'flex-row-reverse' : ''}`}
    >
      <span
        className="inline-block h-2 w-2 rounded-full border"
        style={{
          borderColor: dotColor,
          background: bound ? dotColor : 'transparent',
        }}
      />
      <span className="font-mono text-[8px] text-fl-text-dim">
        {name}
      </span>
      {def.type && (
        <span className="font-mono text-[7px] text-fl-text-ghost">
          {def.type}
        </span>
      )}
    </div>
  );
}

/** Vertical connector line between steps. */
export function StepConnector() {
  return (
    <div className="flex w-[260px] justify-center">
      <div
        className="h-4 w-0.5"
        style={{ background: 'var(--fl-border)' }}
      />
    </div>
  );
}
