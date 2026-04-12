import { useEffect, useState } from 'react';
import type { PortBinding } from '../../types';
import type { NodeManifestEntry, NodePortDef } from '../../../globals';
import { formatLiteral, parseLiteral } from '../../valueLiteral';
import { Select, type SelectOption } from '../ui/Select';
import { Checkbox } from '../ui/Checkbox';

// ──────────────────────────────────────────────────────────────────
// Node sub-sections (ports + params)
// ──────────────────────────────────────────────────────────────────

export interface PortsSectionProps {
  node: NodeManifestEntry;
  bindings: Record<string, PortBinding>;
  scenarioVariables: Record<string, unknown>;
  onBindingChange: (portName: string, binding: PortBinding | undefined) => void;
  onCreateVariable: (key: string, value: unknown) => void;
}

/**
 * Ports panel: lists each in / out port the selected node declares
 * and lets the user either bind it to a scenario variable (picker
 * + create-missing helper) or drop a literal value directly on the
 * block. See docs/03-nodes.md (rev2).
 *
 * In-ports: toggle between "変数" and "値" modes. Var mode shows
 * the scenario-var picker + a "+ 作成" shortcut for names that
 * don't exist yet. Literal mode shows a type-agnostic text input
 * parsed with valueLiteral.parseLiteral.
 *
 * Out-ports: always var-bound (literal output makes no sense), so
 * we only render the picker + create helper.
 */
export function NodePortsSection({
  node,
  bindings,
  scenarioVariables,
  onBindingChange,
  onCreateVariable,
}: PortsSectionProps) {
  const portEntries = Object.entries(node.ports);
  if (portEntries.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">PORTS</span>
        <div className="rounded-md border border-fl-border-2 bg-fl-bg px-2 py-1 font-mono text-[10px] text-fl-text-ghost">
          (no ports)
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] text-fl-text-faint">PORTS</span>
      <div className="flex flex-col gap-2">
        {portEntries.map(([portName, def]) => (
          <PortRow
            key={portName}
            name={portName}
            def={def}
            binding={bindings[portName]}
            scenarioVariables={scenarioVariables}
            onChange={(next) => onBindingChange(portName, next)}
            onCreateVariable={onCreateVariable}
          />
        ))}
      </div>
    </div>
  );
}

export interface PortRowProps {
  name: string;
  def: NodePortDef;
  binding: PortBinding | undefined;
  scenarioVariables: Record<string, unknown>;
  onChange: (next: PortBinding | undefined) => void;
  onCreateVariable: (key: string, value: unknown) => void;
}

export function PortRow({
  name,
  def,
  binding,
  scenarioVariables,
  onChange,
  onCreateVariable,
}: PortRowProps) {
  const kindColor = def.kind === 'in' ? '#60a5fa' : '#22c55e';
  const kindLabel = def.kind === 'in' ? '←' : '→';

  // Header (arrow + port name + type hint)
  const header = (
    <div className="flex items-center gap-1.5">
      <span
        className="flex-shrink-0 font-mono text-[10px] font-bold"
        style={{ color: kindColor }}
        title={def.kind === 'in' ? '入力ポート' : '出力ポート'}
      >
        {kindLabel}
      </span>
      <span
        className="flex-1 truncate font-mono text-[10px] text-fl-text-dim"
        title={`${name}${def.type ? ` : ${def.type}` : ''}${def.required ? ' *' : ''}`}
      >
        {name}
        {def.required && <span className="text-[#f59e0b]">*</span>}
      </span>
      {def.type && (
        <span className="flex-shrink-0 font-mono text-[8px] text-fl-text-ghost">
          {def.type}
        </span>
      )}
    </div>
  );

  // Out-ports: var-only editor
  if (def.kind === 'out') {
    return (
      <div className="flex flex-col gap-1">
        {header}
        <VariableField
          value={binding?.kind === 'var' ? binding.key : ''}
          scenarioVariables={scenarioVariables}
          onCommit={(key) =>
            onChange(key ? { kind: 'var', key } : undefined)
          }
          onCreateVariable={onCreateVariable}
        />
      </div>
    );
  }

  // In-ports: var / literal toggle + type-appropriate editor
  const mode: 'var' | 'literal' = binding?.kind ?? 'var';
  const switchMode = (next: 'var' | 'literal') => {
    if (next === mode) return;
    if (next === 'var') {
      onChange({ kind: 'var', key: '' });
    } else {
      onChange({ kind: 'literal', value: '' });
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {header}
      <div className="flex items-center gap-1">
        <ModeToggle mode={mode} onChange={switchMode} />
        <div className="min-w-0 flex-1">
          {mode === 'var' ? (
            <VariableField
              value={binding?.kind === 'var' ? binding.key : ''}
              scenarioVariables={scenarioVariables}
              onCommit={(key) =>
                onChange(key ? { kind: 'var', key } : undefined)
              }
              onCreateVariable={onCreateVariable}
            />
          ) : (
            <LiteralField
              value={binding?.kind === 'literal' ? binding.value : undefined}
              onCommit={(value) => onChange({ kind: 'literal', value })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mode toggle ──────────────────────────────────────────────────

export interface ModeToggleProps {
  mode: 'var' | 'literal';
  onChange: (next: 'var' | 'literal') => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const btnCls =
    'px-1.5 py-0.5 font-mono text-[9px] transition-colors';
  return (
    <div className="flex flex-shrink-0 overflow-hidden rounded border border-fl-border-2">
      <button
        type="button"
        onClick={() => onChange('var')}
        className={btnCls}
        style={{
          background: mode === 'var' ? '#3b82f622' : 'transparent',
          color:
            mode === 'var' ? '#60a5fa' : 'var(--fl-text-ghost)',
        }}
        title="シナリオ変数を参照"
      >
        変数
      </button>
      <button
        type="button"
        onClick={() => onChange('literal')}
        className={btnCls}
        style={{
          background: mode === 'literal' ? '#3b82f622' : 'transparent',
          color:
            mode === 'literal' ? '#60a5fa' : 'var(--fl-text-ghost)',
        }}
        title="値を直接指定"
      >
        値
      </button>
    </div>
  );
}

// ── Variable field (picker + create helper) ─────────────────────

export interface VariableFieldProps {
  value: string;
  scenarioVariables: Record<string, unknown>;
  onCommit: (key: string) => void;
  onCreateVariable: (key: string, value: unknown) => void;
}

/**
 * Editor for a `var`-kind binding. The user types a fully-qualified
 * key (e.g. `scenario.target`) and the field is live-checked against
 * the scenario variable store. If the key is a `scenario.*` name that
 * doesn't exist yet, a "+ 作成" button appears — clicking it creates
 * the variable with a null initial value and commits the binding.
 *
 * We only offer auto-create for scenario-scoped keys because track
 * variables aren't yet surfaced in any UI.
 */
export function VariableField({
  value,
  scenarioVariables,
  onCommit,
  onCreateVariable,
}: VariableFieldProps) {
  const [local, setLocal] = useState(value);

  // Resync when the external binding identity changes.
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const scenarioKey =
    local.startsWith('scenario.') && local.length > 'scenario.'.length
      ? local.slice('scenario.'.length)
      : null;
  const existsInStore =
    scenarioKey !== null && scenarioKey in scenarioVariables;
  const canCreate =
    scenarioKey !== null && !existsInStore && scenarioKey.trim() !== '';

  const commit = () => {
    const trimmed = local.trim();
    if (trimmed === value) return;
    onCommit(trimmed);
  };

  const handleCreate = () => {
    if (!scenarioKey) return;
    onCreateVariable(scenarioKey, null);
    // Commit the binding so the UI reflects the new link immediately.
    onCommit(local.trim());
  };

  // Known variable names for the datalist (autocomplete suggestions).
  const datalistId = `flowline-vars-${Math.abs(hashString(value || local))}`;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setLocal(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="scenario.xxx"
        list={datalistId}
        className="min-w-0 flex-1 rounded border border-fl-border-2 bg-fl-bg px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-fl-text-dim"
      />
      <datalist id={datalistId}>
        {Object.keys(scenarioVariables).map((k) => (
          <option key={k} value={`scenario.${k}`} />
        ))}
      </datalist>
      {canCreate && (
        <button
          type="button"
          onClick={handleCreate}
          className="flex-shrink-0 rounded border border-[#22c55e] bg-[#22c55e18] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#22c55e] transition-colors hover:bg-[#22c55e30]"
          title={`scenario.${scenarioKey} を新規作成`}
        >
          + 作成
        </button>
      )}
    </div>
  );
}

export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ── Literal field ────────────────────────────────────────────────

export interface LiteralFieldProps {
  value: unknown;
  onCommit: (next: unknown) => void;
}

/**
 * Editor for a `literal`-kind binding. Type-agnostic: the user types
 * whatever they want and we parse it with the shared value-literal
 * helper. The same rules that govern VariablesModal apply here so
 * the experience is consistent (numbers, booleans, JSON, string
 * fallback).
 */
export function LiteralField({ value, onCommit }: LiteralFieldProps) {
  const [local, setLocal] = useState<string>(() => formatLiteral(value));

  // Resync when the external binding identity changes.
  const valueKey = formatLiteral(value);
  useEffect(() => {
    setLocal(valueKey);
  }, [valueKey]);

  const commit = () => {
    const parsed = parseLiteral(local);
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      placeholder='"hello" / 42 / true / {"x":1}'
      className="w-full rounded border border-fl-border-2 bg-fl-bg px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-fl-text-dim"
    />
  );
}

export interface ParamsSectionProps {
  node: NodeManifestEntry;
  params: Record<string, unknown>;
  onParamChange: (
    paramName: string,
    value: string | number | boolean | undefined,
  ) => void;
}

/**
 * Params panel: renders an editor per param declared by the node's
 * ``@node(params=...)`` decorator. Schema is extremely simple — we
 * support enum / number / boolean / string for now; anything else
 * falls back to a plain text input. The value sent on the wire is
 * ``block.params[key]`` which overlays the decorator's ``default``
 * inside the worker.
 */
export function NodeParamsSection({
  node,
  params,
  onParamChange,
}: ParamsSectionProps) {
  const entries = Object.entries(node.params);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] text-fl-text-faint">PARAMS</span>
      <div className="flex flex-col gap-1.5">
        {entries.map(([key, rawMeta]) => {
          const meta = (rawMeta ?? {}) as {
            type?: string;
            default?: unknown;
            choices?: string[];
          };
          const current = params[key];
          const effective = current !== undefined ? current : meta.default;
          const overridden = current !== undefined;
          return (
            <ParamRow
              key={key}
              name={key}
              type={meta.type}
              choices={meta.choices}
              value={effective}
              overridden={overridden}
              onChange={(v) => onParamChange(key, v)}
              onReset={() => onParamChange(key, undefined)}
            />
          );
        })}
      </div>
    </div>
  );
}

export interface ParamRowProps {
  name: string;
  type: string | undefined;
  choices: string[] | undefined;
  value: unknown;
  overridden: boolean;
  onChange: (v: string | number | boolean | undefined) => void;
  onReset: () => void;
}

export function ParamRow({
  name,
  type,
  choices,
  value,
  overridden,
  onChange,
  onReset,
}: ParamRowProps) {
  const common = 'min-w-0 flex-1 rounded border bg-fl-bg px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none focus:border-fl-text-dim';
  const borderCls = overridden
    ? 'border-[#3b82f6]'
    : 'border-fl-border-2';

  let control: React.ReactNode;
  if (type === 'enum' && choices && choices.length > 0) {
    const opts: SelectOption<string>[] = choices.map((c) => ({
      value: c,
      label: c,
    }));
    control = (
      <div className="min-w-0 flex-1">
        <Select<string>
          value={typeof value === 'string' ? value : (choices[0] ?? '')}
          onValueChange={(v) => onChange(v)}
          options={opts}
        />
      </div>
    );
  } else if (type === 'number') {
    control = (
      <input
        type="number"
        value={
          value === undefined || value === null
            ? ''
            : typeof value === 'number'
              ? value
              : String(value)
        }
        onChange={(e) =>
          onChange(e.target.value === '' ? undefined : Number(e.target.value))
        }
        className={`${common} ${borderCls}`}
      />
    );
  } else if (type === 'boolean') {
    control = (
      <div className="flex flex-1 items-center">
        <Checkbox
          checked={value === true}
          onCheckedChange={(v) => onChange(v)}
          accent="#3b82f6"
        />
      </div>
    );
  } else {
    control = (
      <input
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) =>
          onChange(e.target.value === '' ? undefined : e.target.value)
        }
        className={`${common} ${borderCls}`}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="flex-shrink-0 truncate font-mono text-[10px] text-fl-text-dim"
        style={{ width: 76 }}
        title={`${name}${type ? ` : ${type}` : ''}`}
      >
        {name}
      </span>
      {control}
      {overridden && (
        <button
          type="button"
          onClick={onReset}
          title="デフォルトに戻す"
          className="flex-shrink-0 font-mono text-[9px] text-fl-text-faint hover:text-fl-text"
        >
          ↺
        </button>
      )}
    </div>
  );
}
