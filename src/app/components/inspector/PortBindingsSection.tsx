import type { NodePortDef } from '../../../globals';
import type { PortBinding } from '../../types';
import { Select } from '../ui/Select';

interface Props {
  stepId: string;
  ports: Record<string, NodePortDef>;
  bindings: Record<string, PortBinding> | undefined;
  scenarioVariables: Record<string, unknown>;
  onUpdateBindings: (bindings: Record<string, PortBinding>) => void;
}

type BindingMode = 'var' | 'literal';

const modeOptions = [
  { value: 'var' as const, label: '変数' },
  { value: 'literal' as const, label: 'リテラル' },
];

/**
 * Renders input/output port binding rows for the selected node.
 * Each in-port gets a mode selector (変数 / リテラル) and a value input.
 * Out-ports are always variable-mode (they write into a scenario variable).
 */
export function PortBindingsSection({
  stepId,
  ports,
  bindings = {},
  scenarioVariables,
  onUpdateBindings,
}: Props) {
  const varKeys = Object.keys(scenarioVariables).map((k) => `scenario.${k}`);
  const datalistId = `port-vars-${stepId}`;

  const entries = Object.entries(ports);
  const inPorts = entries.filter(([, d]) => d.kind === 'in');
  const outPorts = entries.filter(([, d]) => d.kind === 'out');

  if (inPorts.length === 0 && outPorts.length === 0) return null;

  const getMode = (name: string): BindingMode => {
    const b = bindings[name];
    return b?.kind === 'literal' ? 'literal' : 'var';
  };

  const getVal = (name: string): string => {
    const b = bindings[name];
    if (!b) return '';
    return b.kind === 'var' ? b.key : String(b.value ?? '');
  };

  const update = (name: string, mode: BindingMode, raw: string) => {
    const next: PortBinding =
      mode === 'var' ? { kind: 'var', key: raw } : { kind: 'literal', value: raw };
    onUpdateBindings({ ...bindings, [name]: next });
  };

  const renderPort = (name: string, def: NodePortDef) => {
    const mode = getMode(name);
    const val = getVal(name);
    const isOut = def.kind === 'out';
    return (
      <div key={name} className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 font-mono text-[9px] text-fl-text-dim">
          <span>{name}</span>
          {def.type && <span className="text-fl-text-ghost">({def.type})</span>}
          {def.required && (
            <span className="rounded bg-[#3b82f620] px-1 py-px font-mono text-[8px] font-bold text-fl-accent">
              required
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {!isOut && (
            <div className="w-[68px] flex-shrink-0">
              <Select<BindingMode>
                value={mode}
                onValueChange={(m) => update(name, m, val)}
                options={modeOptions}
              />
            </div>
          )}
          <input
            list={mode === 'var' || isOut ? datalistId : undefined}
            value={val}
            onChange={(e) => update(name, isOut ? 'var' : mode, e.target.value)}
            placeholder={isOut || mode === 'var' ? 'scenario.変数名' : '値'}
            className="min-w-0 flex-1 rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <datalist id={datalistId}>
        {varKeys.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>

      {inPorts.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-fl-text-faint">
            INPUT PORTS
          </div>
          {inPorts.map(([name, def]) => renderPort(name, def))}
        </div>
      )}

      {outPorts.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-fl-text-faint">
            OUTPUT PORTS
          </div>
          {outPorts.map(([name, def]) => renderPort(name, def))}
        </div>
      )}
    </div>
  );
}
