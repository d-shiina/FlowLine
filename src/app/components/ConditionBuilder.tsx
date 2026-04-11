import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatLiteral, parseLiteral } from '../valueLiteral';
import { Select, type SelectOption } from './ui/Select';

/**
 * GUI for assembling a JSON Logic condition used by loop
 * (``whileCondition``) and branch (``condition``) blocks.
 *
 * Design:
 *
 * - **Row-based comparisons**. Each row is a single binary
 *   comparison (``left <op> right``). Operands are either a
 *   scenario variable (picked from a datalist of known keys) or
 *   a literal value parsed by the shared ``valueLiteral`` helper
 *   (so ``42`` → number, ``true`` → bool, ``hello`` → string).
 * - **AND / OR combinator** at the top level. With one row the
 *   combinator is invisible; with two or more rows, a pill
 *   lets the user toggle how they're joined.
 * - **Raw JSON fallback**. Not every JSON Logic expression
 *   fits the rows schema (nested ops, `if`/`in`/etc.). The
 *   builder detects that on mount and auto-switches to a
 *   textarea with parse-error reporting. A "raw" toggle lets
 *   the user opt out of the GUI deliberately.
 * - The generated expression is round-trip lossless for any
 *   value the builder itself could have produced.
 */

type ComparisonOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in';

const OP_OPTIONS: SelectOption<ComparisonOp>[] = [
  { value: '==', label: '==' },
  { value: '!=', label: '≠' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: 'in', label: 'in' },
];

type OperandKind = 'var' | 'literal';

interface Operand {
  kind: OperandKind;
  /** Variable key when kind='var' (e.g. "scenario.count"). */
  varKey: string;
  /** Raw display string when kind='literal'. */
  literalRaw: string;
}

interface Row {
  left: Operand;
  op: ComparisonOp;
  right: Operand;
}

type Combinator = 'and' | 'or';

interface BuilderState {
  combinator: Combinator;
  rows: Row[];
}

interface Props {
  value: unknown;
  onChange: (next: unknown) => void;
  scenarioVariables: Record<string, unknown>;
  /** Extra variable keys to offer in the picker (e.g. live track.* keys). */
  extraVariableKeys?: string[];
  /** Placeholder label shown on the empty-state form. */
  placeholder?: string;
}

export function ConditionBuilder({
  value,
  onChange,
  scenarioVariables,
  extraVariableKeys = [],
  placeholder,
}: Props) {
  // Parse the incoming expression into rows on mount. If it
  // doesn't fit the schema, drop into raw mode with the JSON
  // serialised into the textarea.
  const parsed = useMemo(() => tryParse(value), [value]);
  const [rawForced, setRawForced] = useState(false);
  const raw = parsed === null || rawForced;

  // Known variable keys for the var picker datalist.
  const knownVarKeys = useMemo(() => {
    const keys = new Set<string>(extraVariableKeys);
    for (const k of Object.keys(scenarioVariables)) {
      keys.add(`scenario.${k}`);
    }
    return Array.from(keys).sort();
  }, [scenarioVariables, extraVariableKeys]);

  if (raw) {
    return (
      <RawMode
        value={value}
        onChange={onChange}
        canSwitchToBuilder={parsed !== null}
        onSwitchToBuilder={() => setRawForced(false)}
        onForceRaw={() => setRawForced(true)}
      />
    );
  }

  return (
    <BuilderMode
      state={parsed}
      onChange={(nextState) => onChange(serialize(nextState))}
      knownVarKeys={knownVarKeys}
      onForceRaw={() => setRawForced(true)}
      placeholder={placeholder}
    />
  );
}

// ── Builder UI ────────────────────────────────────────────────────

interface BuilderModeProps {
  state: BuilderState;
  onChange: (next: BuilderState) => void;
  knownVarKeys: string[];
  onForceRaw: () => void;
  placeholder?: string;
}

function BuilderMode({
  state,
  onChange,
  knownVarKeys,
  onForceRaw,
  placeholder,
}: BuilderModeProps) {
  const { combinator, rows } = state;

  const updateRow = (idx: number, next: Row) => {
    onChange({
      combinator,
      rows: rows.map((r, i) => (i === idx ? next : r)),
    });
  };

  const addRow = () => {
    onChange({
      combinator,
      rows: [...rows, defaultRow()],
    });
  };

  const deleteRow = (idx: number) => {
    onChange({
      combinator,
      rows: rows.filter((_, i) => i !== idx),
    });
  };

  const setCombinator = (next: Combinator) => {
    onChange({ combinator: next, rows });
  };

  return (
    <div className="flex flex-col gap-1.5">
      {rows.length === 0 ? (
        <button
          type="button"
          onClick={addRow}
          className="rounded border border-dashed border-fl-border-strong bg-fl-panel-2 px-2 py-1.5 font-mono text-[10px] text-fl-text-faint transition-colors hover:border-fl-text-dim hover:text-fl-text"
        >
          + 条件を追加{placeholder ? ` (${placeholder})` : ''}
        </button>
      ) : (
        <>
          {rows.length >= 2 && (
            <div className="flex gap-1">
              <CombinatorPill
                active={combinator === 'and'}
                onClick={() => setCombinator('and')}
                label="AND"
                color="#3b82f6"
              />
              <CombinatorPill
                active={combinator === 'or'}
                onClick={() => setCombinator('or')}
                label="OR"
                color="#f59e0b"
              />
            </div>
          )}
          {rows.map((row, i) => (
            <RowEditor
              key={i}
              row={row}
              knownVarKeys={knownVarKeys}
              onChange={(next) => updateRow(i, next)}
              onDelete={rows.length > 1 ? () => deleteRow(i) : undefined}
            />
          ))}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1 rounded border border-fl-border-2 bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[9px] text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text"
            >
              <Plus className="h-2.5 w-2.5" />
              条件を追加
            </button>
            <button
              type="button"
              onClick={onForceRaw}
              className="ml-auto font-mono text-[8px] text-fl-text-ghost hover:text-fl-text-faint"
              title="生の JSON Logic を編集"
            >
              raw ›
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CombinatorPill({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2 py-0.5 font-mono text-[9px] font-bold transition-colors"
      style={{
        border: `1px solid ${active ? color : 'var(--fl-border-2)'}`,
        background: active ? `${color}22` : 'transparent',
        color: active ? color : 'var(--fl-text-ghost)',
      }}
    >
      {label}
    </button>
  );
}

interface RowEditorProps {
  row: Row;
  knownVarKeys: string[];
  onChange: (next: Row) => void;
  onDelete?: () => void;
}

function RowEditor({ row, knownVarKeys, onChange, onDelete }: RowEditorProps) {
  return (
    <div className="flex flex-col gap-1 rounded border border-fl-border-2 bg-fl-bg p-1.5">
      <OperandEditor
        operand={row.left}
        knownVarKeys={knownVarKeys}
        onChange={(left) => onChange({ ...row, left })}
      />
      <div className="flex items-center gap-1">
        <div style={{ width: 60 }}>
          <Select<ComparisonOp>
            value={row.op}
            onValueChange={(op) => onChange({ ...row, op })}
            options={OP_OPTIONS}
          />
        </div>
        <div className="flex-1" />
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-fl-text-faint transition-colors hover:text-red-500"
            title="条件を削除"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <OperandEditor
        operand={row.right}
        knownVarKeys={knownVarKeys}
        onChange={(right) => onChange({ ...row, right })}
      />
    </div>
  );
}

interface OperandEditorProps {
  operand: Operand;
  knownVarKeys: string[];
  onChange: (next: Operand) => void;
}

function OperandEditor({ operand, knownVarKeys, onChange }: OperandEditorProps) {
  const listId = useMemo(
    () => `cond-vars-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );
  return (
    <div className="flex items-center gap-1">
      <div style={{ width: 52 }}>
        <Select<OperandKind>
          value={operand.kind}
          onValueChange={(kind) => onChange({ ...operand, kind })}
          options={[
            { value: 'var', label: '変数' },
            { value: 'literal', label: '値' },
          ]}
        />
      </div>
      {operand.kind === 'var' ? (
        <>
          <input
            value={operand.varKey}
            onChange={(e) => onChange({ ...operand, varKey: e.target.value })}
            placeholder="scenario.xxx"
            list={listId}
            className="min-w-0 flex-1 rounded border border-fl-border-2 bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-fl-text-dim"
          />
          <datalist id={listId}>
            {knownVarKeys.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </>
      ) : (
        <input
          value={operand.literalRaw}
          onChange={(e) =>
            onChange({ ...operand, literalRaw: e.target.value })
          }
          placeholder='"hello" / 42 / true'
          className="min-w-0 flex-1 rounded border border-fl-border-2 bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none placeholder:text-fl-text-ghost focus:border-fl-text-dim"
        />
      )}
    </div>
  );
}

// ── Raw JSON fallback ────────────────────────────────────────────

interface RawModeProps {
  value: unknown;
  onChange: (next: unknown) => void;
  canSwitchToBuilder: boolean;
  onSwitchToBuilder: () => void;
  onForceRaw: () => void;
}

function RawMode({
  value,
  onChange,
  canSwitchToBuilder,
  onSwitchToBuilder,
}: RawModeProps) {
  const initial = value === undefined ? '' : JSON.stringify(value, null, 2);
  const [local, setLocal] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  // Resync when the external value identity changes.
  const syncKey = initial;
  useMemoSync(syncKey, () => {
    setLocal(initial);
    setError(null);
  });

  const commit = () => {
    const trimmed = local.trim();
    if (trimmed === '') {
      onChange(undefined);
      setError(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      onChange(parsed);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        spellCheck={false}
        rows={4}
        placeholder='{ "<": [{ "var": "scenario.count" }, 10] }'
        className="resize-none rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[10px] leading-relaxed text-fl-text outline-none"
      />
      <div className="flex items-center justify-between gap-2">
        {error ? (
          <span className="flex-1 font-mono text-[9px] text-[#ef4444]">
            {error}
          </span>
        ) : (
          <span className="flex-1 font-mono text-[8px] text-fl-text-ghost">
            生の JSON Logic 式を入力
          </span>
        )}
        {canSwitchToBuilder && (
          <button
            type="button"
            onClick={onSwitchToBuilder}
            className="font-mono text-[8px] text-fl-text-ghost hover:text-fl-text-faint"
            title="ビルダーに戻す"
          >
            ‹ builder
          </button>
        )}
      </div>
    </div>
  );
}

function useMemoSync(key: string, effect: () => void): void {
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (prev.current !== key) {
      prev.current = key;
      effect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

// ── Parse / serialize ────────────────────────────────────────────

const COMPARISON_OPS: ComparisonOp[] = [
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'in',
];

function defaultRow(): Row {
  return {
    left: { kind: 'var', varKey: 'scenario.', literalRaw: '' },
    op: '==',
    right: { kind: 'literal', varKey: '', literalRaw: '' },
  };
}

/**
 * Attempt to parse a JSON Logic expression into the builder's
 * row model. Returns null when the shape isn't supported (raw
 * fallback is used in that case). ``undefined`` produces an empty
 * builder.
 */
function tryParse(value: unknown): BuilderState | null {
  if (value === undefined) {
    return { combinator: 'and', rows: [] };
  }
  // Top-level and/or of comparisons.
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 1 && (keys[0] === 'and' || keys[0] === 'or')) {
      const args = (value as Record<string, unknown>)[keys[0]];
      if (!Array.isArray(args) || args.length === 0) return null;
      const rows: Row[] = [];
      for (const a of args) {
        const row = parseRow(a);
        if (!row) return null;
        rows.push(row);
      }
      return { combinator: keys[0] as Combinator, rows };
    }
  }
  // Single comparison.
  const single = parseRow(value);
  if (single) return { combinator: 'and', rows: [single] };
  return null;
}

function parseRow(expr: unknown): Row | null {
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    return null;
  }
  const keys = Object.keys(expr as Record<string, unknown>);
  if (keys.length !== 1) return null;
  const op = keys[0] as ComparisonOp;
  if (!COMPARISON_OPS.includes(op)) return null;
  const args = (expr as Record<string, unknown>)[op];
  if (!Array.isArray(args) || args.length !== 2) return null;
  const left = parseOperand(args[0]);
  const right = parseOperand(args[1]);
  if (!left || !right) return null;
  return { left, op, right };
}

function parseOperand(expr: unknown): Operand | null {
  if (typeof expr === 'object' && expr !== null && !Array.isArray(expr)) {
    const keys = Object.keys(expr as Record<string, unknown>);
    if (keys.length === 1 && keys[0] === 'var') {
      const key = (expr as Record<string, unknown>).var;
      if (typeof key === 'string') {
        return { kind: 'var', varKey: key, literalRaw: '' };
      }
    }
    return null;
  }
  // Primitive literal — feed into the shared formatter so the
  // editor display matches VariablesModal semantics.
  return {
    kind: 'literal',
    varKey: '',
    literalRaw: formatLiteral(expr),
  };
}

function serialize(state: BuilderState): unknown {
  if (state.rows.length === 0) return undefined;
  const parts = state.rows.map(serializeRow);
  if (parts.length === 1) return parts[0];
  return { [state.combinator]: parts };
}

function serializeRow(row: Row): unknown {
  return {
    [row.op]: [serializeOperand(row.left), serializeOperand(row.right)],
  };
}

function serializeOperand(op: Operand): unknown {
  if (op.kind === 'var') {
    return { var: op.varKey };
  }
  return parseLiteral(op.literalRaw);
}
