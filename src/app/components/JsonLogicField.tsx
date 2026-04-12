import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatLiteral, parseLiteral } from '../valueLiteral';
import { Select, type SelectOption } from './ui/Select';

/**
 * Unified JSON Logic editor used by every FLOWLINE surface that
 * stores an expression on a block (branch condition, loop while
 * condition, switch expression). Two primary modes:
 *
 * - ``comparison`` — row-based binary comparison builder used by
 *   branch/loop conditions. Each row is a single ``left <op> right``
 *   with var/literal operands; multiple rows compose with AND / OR.
 *   When the current value doesn't match this row schema (nested
 *   ops, ``cat``, ``in``, etc.) the component falls back to the
 *   raw JSON textarea automatically.
 *
 * - ``value`` — single-line variable picker used by switch
 *   expressions. The typical case is ``{ "var": "scenario.status" }``
 *   so a simple text input with a datalist of scenario keys covers
 *   it in one interaction. Same raw-JSON fallback for anything
 *   more complex.
 *
 * The raw mode is shared by both, and users can always force raw
 * with the ``詳細 ›`` toggle (or return to the builder with
 * ``‹ builder`` when the expression is compatible).
 */

type Mode = 'comparison' | 'value';

interface Props {
  value: unknown;
  onChange: (next: unknown) => void;
  scenarioVariables: Record<string, unknown>;
  /** Which primary editor to show. Defaults to ``comparison``. */
  mode?: Mode;
  /** Extra variable keys to offer in pickers (e.g. live track.* keys). */
  extraVariableKeys?: string[];
  /** Placeholder label shown on the empty-state form. */
  placeholder?: string;
}

export function JsonLogicField({
  value,
  onChange,
  scenarioVariables,
  mode = 'comparison',
  extraVariableKeys = [],
  placeholder,
}: Props) {
  const knownVarKeys = useMemo(() => {
    const keys = new Set<string>(extraVariableKeys);
    for (const k of Object.keys(scenarioVariables)) {
      keys.add(`scenario.${k}`);
    }
    return Array.from(keys).sort();
  }, [scenarioVariables, extraVariableKeys]);

  // Try to parse the incoming value into whichever builder schema
  // matches the current mode. Null means the value doesn't fit,
  // so we drop into raw mode.
  const parsed = useMemo(
    () =>
      mode === 'comparison'
        ? tryParseComparison(value)
        : tryParseValueMode(value),
    [value, mode],
  );
  const [rawForced, setRawForced] = useState(false);
  const raw = parsed === null || rawForced;

  if (raw) {
    return (
      <RawMode
        value={value}
        onChange={onChange}
        canSwitchToBuilder={parsed !== null}
        onSwitchToBuilder={() => setRawForced(false)}
      />
    );
  }

  if (mode === 'comparison') {
    return (
      <ComparisonMode
        state={parsed as BuilderState}
        onChange={(nextState) => onChange(serializeComparison(nextState))}
        knownVarKeys={knownVarKeys}
        onForceRaw={() => setRawForced(true)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <ValueMode
      state={parsed as ValueState}
      onChange={(nextState) => onChange(serializeValue(nextState))}
      knownVarKeys={knownVarKeys}
      onForceRaw={() => setRawForced(true)}
    />
  );
}

// ── Comparison (row-based) primary mode ──────────────────────────

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

interface ComparisonModeProps {
  state: BuilderState;
  onChange: (next: BuilderState) => void;
  knownVarKeys: string[];
  onForceRaw: () => void;
  placeholder?: string;
}

function ComparisonMode({
  state,
  onChange,
  knownVarKeys,
  onForceRaw,
  placeholder,
}: ComparisonModeProps) {
  const { combinator, rows } = state;

  const updateRow = (idx: number, next: Row) => {
    onChange({
      combinator,
      rows: rows.map((r, i) => (i === idx ? next : r)),
    });
  };

  const addRow = () => {
    onChange({ combinator, rows: [...rows, defaultRow()] });
  };

  const deleteRow = (idx: number) => {
    onChange({ combinator, rows: rows.filter((_, i) => i !== idx) });
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

// ── Value (single operand) primary mode ─────────────────────────

interface ValueState {
  /** When set, the value is a ``{ var: key }`` reference. */
  varKey: string | null;
}

interface ValueModeProps {
  state: ValueState;
  onChange: (next: ValueState) => void;
  knownVarKeys: string[];
  onForceRaw: () => void;
}

function ValueMode({
  state,
  onChange,
  knownVarKeys,
  onForceRaw,
}: ValueModeProps) {
  const [local, setLocal] = useState(state.varKey ?? '');

  // Resync on external value identity changes.
  useEffect(() => {
    setLocal(state.varKey ?? '');
  }, [state.varKey]);

  const commit = () => {
    const trimmed = local.trim();
    onChange({ varKey: trimmed === '' ? null : trimmed });
  };

  const datalistId = useMemo(
    () => `jsonlogic-value-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );
  return (
    <div className="flex items-center gap-1">
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="scenario.xxx"
        list={datalistId}
        className="min-w-0 flex-1 rounded border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none focus:border-[#3b82f6]"
      />
      <datalist id={datalistId}>
        {knownVarKeys.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={onForceRaw}
        className="flex-shrink-0 font-mono text-[8px] text-fl-text-ghost hover:text-fl-text-faint"
        title="JSON Logic 式を直接編集"
      >
        詳細 ›
      </button>
    </div>
  );
}

// ── Raw JSON fallback (shared) ───────────────────────────────────

interface RawModeProps {
  value: unknown;
  onChange: (next: unknown) => void;
  canSwitchToBuilder: boolean;
  onSwitchToBuilder: () => void;
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

  useKeyChangeEffect(initial, () => {
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

/**
 * Fire `effect` only when `key` changes between renders, so the raw
 * textarea resyncs when an external value update arrives but never
 * fights the user's in-progress typing.
 */
function useKeyChangeEffect(key: string, effect: () => void): void {
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
 * Try to parse a JSON Logic value into the comparison-row schema.
 * Returns null when the expression has nested ops or non-supported
 * operators so the caller drops into raw mode.
 */
function tryParseComparison(value: unknown): BuilderState | null {
  if (value === undefined) return { combinator: 'and', rows: [] };
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
  return {
    kind: 'literal',
    varKey: '',
    literalRaw: formatLiteral(expr),
  };
}

function serializeComparison(state: BuilderState): unknown {
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
  if (op.kind === 'var') return { var: op.varKey };
  return parseLiteral(op.literalRaw);
}

/**
 * Try to parse a JSON Logic value into the value-mode schema
 * (single ``{ var: "..." }`` reference). Returns null for
 * anything more complex so the caller drops into raw mode.
 */
function tryParseValueMode(value: unknown): ValueState | null {
  if (value === undefined) return { varKey: null };
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 1 &&
    (value as Record<string, unknown>).var !== undefined
  ) {
    const key = (value as { var: unknown }).var;
    if (typeof key === 'string') return { varKey: key };
  }
  return null;
}

function serializeValue(state: ValueState): unknown {
  if (state.varKey === null) return undefined;
  return { var: state.varKey };
}
