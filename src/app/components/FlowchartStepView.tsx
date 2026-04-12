import { useState } from 'react';
import type { PortBinding, Step } from '../types';
import { STEP_META } from '../types';
import type { BlockStatus } from '../engine';
import type { NodeManifestEntry } from '../../globals';

interface Props {
  step: Step;
  selected: boolean;
  status: BlockStatus;
  nodeManifest?: NodeManifestEntry;
  scenarioVariables: Record<string, unknown>;
  onSelect: (stepId: string) => void;
  onDelete: (stepId: string) => void;
  onUpdate: (stepId: string, patch: Partial<Step>) => void;
  onDragStart?: (stepId: string, e: React.MouseEvent) => void;
  onRunStep?: (stepId: string) => void;
}

function catIcon(category?: string): string {
  if (!category) return '▶';
  return category.charAt(0).toUpperCase();
}

export function FlowchartStepView({
  step,
  selected,
  status,
  nodeManifest: node,
  scenarioVariables,
  onSelect,
  onDelete,
  onUpdate,
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
              ? `${meta.color}66`
              : `${meta.color}33`;

  const shadow = isError
    ? '0 0 12px #ef444444'
    : isRunning
      ? '0 0 12px #22c55e44'
      : selected
        ? `0 0 0 1px ${meta.color}44`
        : 'none';

  const icon = node ? catIcon(node.category) : meta.icon;
  const varKeys = Object.keys(scenarioVariables).map((k) => `scenario.${k}`);

  // Port info
  const inPorts = node
    ? Object.entries(node.ports).filter(([, d]) => d.kind === 'in')
    : [];
  const outPorts = node
    ? Object.entries(node.ports).filter(([, d]) => d.kind === 'out')
    : [];

  // Param info
  const params = node ? Object.entries(node.params) : [];

  const getBindingValue = (portName: string): string => {
    const b = step.bindings?.[portName];
    if (!b) return '';
    return b.kind === 'var' ? b.key : String(b.value ?? '');
  };

  const setBinding = (portName: string, raw: string, isOut: boolean) => {
    const binding: PortBinding = isOut
      ? { kind: 'var', key: raw }
      : raw.startsWith('scenario.') || raw.startsWith('track.')
        ? { kind: 'var', key: raw }
        : { kind: 'literal', value: raw };
    onUpdate(step.id, { bindings: { ...step.bindings, [portName]: binding } });
  };

  const getParam = (name: string): string => {
    const v = step.params?.[name];
    if (v === undefined || v === null) return '';
    return String(v);
  };

  const setParam = (name: string, raw: string) => {
    // Auto-detect type
    let value: unknown = raw;
    if (raw === 'true') value = true;
    else if (raw === 'false') value = false;
    else if (raw !== '' && !isNaN(Number(raw))) value = Number(raw);
    onUpdate(step.id, { params: { ...step.params, [name]: value } });
  };

  const datalistId = `vars-${step.id}`;

  return (
    <div
      className="relative w-[320px] select-none rounded-lg transition-all"
      style={{
        border: `${isControl ? 2 : 1.5}px ${isSkipped ? 'dashed' : 'solid'} ${borderColor}`,
        background: 'var(--fl-panel-2)',
        boxShadow: shadow,
        opacity: isSkipped ? 0.5 : 1,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Hidden datalist for variable autocomplete */}
      <datalist id={datalistId}>
        {varKeys.map((k) => <option key={k} value={k} />)}
      </datalist>

      {/* ── Header (draggable) ── */}
      <div
        className="flex cursor-grab items-center gap-1.5 rounded-t-[5px] px-2.5 py-1.5 active:cursor-grabbing"
        style={{ background: `${accent}18` }}
        onMouseDown={(e) => {
          if (e.button === 0 && onDragStart) onDragStart(step.id, e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(step.id);
        }}
      >
        <span
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold"
          style={{ background: `${accent}33`, color: accent }}
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

        {hov ? (
          <div className="flex gap-0.5">
            {onRunStep && (
              <button
                type="button"
                className="flex h-4 w-4 items-center justify-center rounded text-[7px] text-white"
                style={{ background: '#22c55e' }}
                onMouseDown={(e) => { e.stopPropagation(); onRunStep(step.id); }}
              >
                ▶
              </button>
            )}
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded bg-red-500/80 text-[8px] text-white"
              onMouseDown={(e) => { e.stopPropagation(); onDelete(step.id); }}
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

      {/* ── Params (always visible when node assigned) ── */}
      {params.length > 0 && (
        <div className="border-t border-fl-border px-2 py-1.5">
          {params.map(([name, def]) => {
            const pDef = def as Record<string, unknown>;
            const pType = String(pDef.type ?? 'string');
            const choices = Array.isArray(pDef.choices) ? pDef.choices as string[] : null;
            return (
              <div key={name} className="flex items-center gap-1.5 py-0.5">
                <span className="w-[72px] flex-shrink-0 truncate text-right font-mono text-[9px] text-fl-text-dim">
                  {name}
                </span>
                {pType === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={getParam(name) === 'true'}
                    onChange={(e) => setParam(name, String(e.target.checked))}
                    className="accent-[color:var(--accent)]"
                    style={{ '--accent': accent } as React.CSSProperties}
                  />
                ) : choices ? (
                  <select
                    value={getParam(name) || String(pDef.default ?? '')}
                    onChange={(e) => setParam(name, e.target.value)}
                    className="min-w-0 flex-1 rounded border border-fl-border bg-fl-bg px-1 py-0.5 font-mono text-[9px] text-fl-text outline-none"
                  >
                    {choices.map((c) => <option key={String(c)} value={String(c)}>{String(c)}</option>)}
                  </select>
                ) : (
                  <input
                    value={getParam(name) || String(pDef.default ?? '')}
                    onChange={(e) => setParam(name, e.target.value)}
                    placeholder={String(pDef.default ?? '')}
                    className="min-w-0 flex-1 rounded border border-fl-border bg-fl-bg px-1.5 py-0.5 font-mono text-[9px] text-fl-text outline-none focus:border-fl-text-dim"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Ports ── */}
      {(inPorts.length > 0 || outPorts.length > 0) && (
        <div className="border-t border-fl-border px-2 py-1.5">
          {inPorts.map(([name]) => {
            const val = getBindingValue(name);
            const bound = !!val;
            return (
              <div key={name} className="flex items-center gap-1.5 py-0.5">
                <span
                  className="inline-block h-[6px] w-[6px] flex-shrink-0 rounded-full"
                  style={{
                    background: bound ? accent : 'transparent',
                    border: `1.5px solid ${bound ? accent : '#94a3b866'}`,
                  }}
                />
                <span className="w-[60px] flex-shrink-0 font-mono text-[9px] text-fl-text-dim">
                  {name}
                </span>
                <input
                  list={datalistId}
                  value={val}
                  onChange={(e) => setBinding(name, e.target.value, false)}
                  placeholder="scenario.xxx / 値"
                  className="min-w-0 flex-1 rounded border border-fl-border bg-fl-bg px-1.5 py-0.5 font-mono text-[9px] text-fl-text outline-none focus:border-fl-text-dim"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            );
          })}
          {outPorts.map(([name]) => {
            const val = getBindingValue(name);
            const bound = !!val;
            return (
              <div key={name} className="flex items-center justify-end gap-1.5 py-0.5">
                <input
                  list={datalistId}
                  value={val}
                  onChange={(e) => setBinding(name, e.target.value, true)}
                  placeholder="scenario.xxx"
                  className="min-w-0 flex-1 rounded border border-fl-border bg-fl-bg px-1.5 py-0.5 text-right font-mono text-[9px] text-fl-text outline-none focus:border-fl-text-dim"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="font-mono text-[9px] text-fl-text-dim">{name}</span>
                <span
                  className="inline-block h-[6px] w-[6px] flex-shrink-0 rounded-full"
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

      {/* No node hint */}
      {!node && !isControl && step.type !== 'group' && (
        <div className="px-2.5 pb-1.5 font-mono text-[8px] text-fl-text-ghost">
          ノード未設定
        </div>
      )}

      {/* Control flow label */}
      {isControl && (
        <div className="px-2.5 pb-1.5">
          <span className="font-mono text-[8px] font-bold uppercase tracking-wider" style={{ color: `${meta.color}88` }}>
            {meta.label}
          </span>
        </div>
      )}
    </div>
  );
}

/** Horizontal connector arrow between steps. */
export function StepConnector() {
  return (
    <div className="flex flex-shrink-0 items-center self-center px-1">
      <div className="h-0.5 w-4" style={{ background: 'var(--fl-border)' }} />
      <div
        className="h-0 w-0"
        style={{
          borderTop: '3px solid transparent',
          borderBottom: '3px solid transparent',
          borderLeft: '4px solid var(--fl-border)',
        }}
      />
    </div>
  );
}
