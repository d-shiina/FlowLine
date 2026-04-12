import { useEffect, useState } from 'react';
import type { Block } from '../../types';
import { JsonLogicField } from '../JsonLogicField';

// ──────────────────────────────────────────────────────────────────
// Loop / branch built-in control-flow editors
// ──────────────────────────────────────────────────────────────────

export interface LoopParamsProps {
  block: Block;
  scenarioVariables: Record<string, unknown>;
  onChange: (patch: Partial<Block>) => void;
}

/**
 * Loop body editor. Two modes:
 *
 * - **回数**  — ``params.iterations`` (integer, default 1). The
 *   executor runs the body exactly that many times.
 * - **条件** — ``params.whileCondition`` is a JSON Logic expression
 *   the executor re-evaluates before each iteration. The body runs
 *   while the expression is truthy, capped internally so a broken
 *   predicate can't hang the run.
 *
 * The current mode is inferred from which field is set. Switching
 * modes from the UI clears the other field so only one source of
 * truth lives on the block at a time.
 */
export function LoopParamsSection({
  block,
  scenarioVariables,
  onChange,
}: LoopParamsProps) {
  const params =
    (block.params as Record<string, unknown> | undefined) ?? {};
  const hasWhile = params.whileCondition !== undefined;
  const mode: 'count' | 'while' = hasWhile ? 'while' : 'count';

  const iterations =
    typeof params.iterations === 'number' &&
    Number.isFinite(params.iterations) &&
    (params.iterations as number) > 0
      ? Math.floor(params.iterations as number)
      : 1;

  const setMode = (next: 'count' | 'while') => {
    if (next === mode) return;
    const nextParams: Record<string, unknown> = { ...params };
    if (next === 'count') {
      delete nextParams.whileCondition;
      if (nextParams.iterations === undefined) nextParams.iterations = 1;
    } else {
      delete nextParams.iterations;
    }
    onChange({
      params: Object.keys(nextParams).length > 0 ? nextParams : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">
          ループ
        </span>
        <div className="ml-auto flex overflow-hidden rounded border border-fl-border-2">
          <button
            type="button"
            onClick={() => setMode('count')}
            className="px-1.5 py-0.5 font-mono text-[9px] transition-colors"
            style={{
              background: mode === 'count' ? '#8b5cf622' : 'transparent',
              color: mode === 'count' ? '#a78bfa' : 'var(--fl-text-ghost)',
            }}
          >
            回数
          </button>
          <button
            type="button"
            onClick={() => setMode('while')}
            className="px-1.5 py-0.5 font-mono text-[9px] transition-colors"
            style={{
              background: mode === 'while' ? '#8b5cf622' : 'transparent',
              color: mode === 'while' ? '#a78bfa' : 'var(--fl-text-ghost)',
            }}
          >
            条件
          </button>
        </div>
      </div>
      {mode === 'count' ? (
        <>
          <input
            type="number"
            min={1}
            max={10_000}
            value={iterations}
            onChange={(e) => {
              const n = Math.max(
                1,
                Math.floor(Number(e.target.value) || 1),
              );
              const next: Record<string, unknown> = { ...params };
              next.iterations = n;
              onChange({ params: next });
            }}
            className="rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none"
          />
          <span className="font-mono text-[8px] text-fl-text-ghost">
            内包ブロックを上記回数くりかえします
          </span>
        </>
      ) : (
        <>
          <JsonLogicField
            mode="comparison"
            value={params.whileCondition}
            scenarioVariables={scenarioVariables}
            placeholder="真の間くりかえし"
            onChange={(next) => {
              const nextParams: Record<string, unknown> = { ...params };
              if (next === undefined) {
                delete nextParams.whileCondition;
              } else {
                nextParams.whileCondition = next;
              }
              onChange({
                params:
                  Object.keys(nextParams).length > 0 ? nextParams : undefined,
              });
            }}
          />
          <span className="font-mono text-[8px] text-fl-text-ghost">
            条件が真の間くりかえします (最大 10,000 回)
          </span>
        </>
      )}
      <span className="font-mono text-[8px] text-fl-text-ghost">
        反復中は <span className="text-fl-text-dim">track.&lt;id&gt;.loop_index</span>
        &nbsp;が 0 始まりで更新されます
      </span>
    </div>
  );
}

export interface BranchParamsProps {
  block: Block;
  scenarioVariables: Record<string, unknown>;
  onChange: (patch: Partial<Block>) => void;
}

/**
 * Branch condition editor — backed by JsonLogicField in comparison
 * mode. The user builds the condition as rows of binary comparisons
 * and the component falls back to raw JSON for anything more complex.
 */
export function BranchParamsSection({
  block,
  scenarioVariables,
  onChange,
}: BranchParamsProps) {
  const params =
    (block.params as Record<string, unknown> | undefined) ?? {};
  const current = params.condition;
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] text-fl-text-faint">条件</span>
      <JsonLogicField
        mode="comparison"
        value={current}
        scenarioVariables={scenarioVariables}
        onChange={(next) => {
          const nextParams: Record<string, unknown> = { ...params };
          if (next === undefined) {
            delete nextParams.condition;
          } else {
            nextParams.condition = next;
          }
          onChange({
            params:
              Object.keys(nextParams).length > 0 ? nextParams : undefined,
          });
        }}
      />
      <span className="font-mono text-[8px] leading-relaxed text-fl-text-ghost">
        TRUE 側 / FALSE 側 の分岐は内包ブロックのバッジで指定します
      </span>
    </div>
  );
}

export interface SwitchParamsProps {
  block: Block;
  scenarioVariables: Record<string, unknown>;
  onChange: (patch: Partial<Block>) => void;
}

/**
 * Switch block editor.
 *
 * The switch evaluates ``params.expression`` (any JSON Logic) and
 * runs the children whose ``parentBranch`` matches the first
 * winning case from ``params.cases`` (string[]). A conventional
 * ``"default"`` entry acts as the fallback.
 *
 * The expression editor uses JsonLogicField in value mode — most
 * switches key off a single ``{ var: "..." }`` reference, and the
 * raw JSON fallback handles more exotic expressions. The case list
 * lets you add / rename / delete case labels; the first case in
 * the list is the default lane new children land on, and
 * ``"default"`` is treated specially by the executor as a fallback.
 */
export function SwitchParamsSection({
  block,
  scenarioVariables,
  onChange,
}: SwitchParamsProps) {
  const params =
    (block.params as Record<string, unknown> | undefined) ?? {};
  const cases: string[] = Array.isArray(params.cases)
    ? (params.cases as unknown[]).map((c) => String(c))
    : [];

  const commitExpression = (next: unknown) => {
    const nextParams: Record<string, unknown> = { ...params };
    if (next === undefined) {
      delete nextParams.expression;
    } else {
      nextParams.expression = next;
    }
    onChange({
      params: Object.keys(nextParams).length > 0 ? nextParams : undefined,
    });
  };

  const commitCases = (nextCases: string[]) => {
    const nextParams: Record<string, unknown> = { ...params };
    nextParams.cases = nextCases;
    onChange({ params: nextParams });
  };

  const updateCase = (idx: number, next: string) => {
    const trimmed = next.trim();
    if (trimmed === '') return;
    if (cases.some((c, i) => i !== idx && c === trimmed)) return;
    const nextCases = cases.slice();
    nextCases[idx] = trimmed;
    commitCases(nextCases);
  };

  const addCase = () => {
    // Generate a unique default name so repeated clicks don't collide.
    let i = cases.length;
    let candidate = `case_${i}`;
    while (cases.includes(candidate)) {
      i++;
      candidate = `case_${i}`;
    }
    commitCases([...cases, candidate]);
  };

  const addDefault = () => {
    if (cases.includes('default')) return;
    commitCases([...cases, 'default']);
  };

  const deleteCase = (idx: number) => {
    commitCases(cases.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] text-fl-text-faint">評価式</span>
        <JsonLogicField
          mode="value"
          value={params.expression}
          scenarioVariables={scenarioVariables}
          onChange={commitExpression}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-fl-text-faint">
            ケース一覧
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={addCase}
              className="rounded border border-fl-border-2 bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[9px] text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text"
            >
              + case
            </button>
            <button
              type="button"
              onClick={addDefault}
              disabled={cases.includes('default')}
              className="rounded border border-fl-border-2 bg-fl-panel-2 px-1.5 py-0.5 font-mono text-[9px] text-fl-text-dim transition-colors hover:border-fl-text-dim hover:text-fl-text disabled:opacity-40"
            >
              + default
            </button>
          </div>
        </div>
        {cases.length === 0 && (
          <span className="font-mono text-[9px] text-fl-text-ghost">
            `+ case` で最初のケースを追加
          </span>
        )}
        {cases.map((c, i) => (
          <SwitchCaseRow
            key={`${c}-${i}`}
            value={c}
            onCommit={(next) => updateCase(i, next)}
            onDelete={() => deleteCase(i)}
          />
        ))}
      </div>
      <span className="font-mono text-[8px] leading-relaxed text-fl-text-ghost">
        評価式の値と一致したケースの内包ブロックを実行します。
        どれにも一致しなければ <span className="text-fl-text-dim">default</span> のブロックが実行されます
      </span>
    </div>
  );
}

export interface SwitchCaseRowProps {
  value: string;
  onCommit: (next: string) => void;
  onDelete: () => void;
}

export function SwitchCaseRow({ value, onCommit, onDelete }: SwitchCaseRowProps) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <div className="flex items-center gap-1">
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onCommit(local);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setLocal(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="min-w-0 flex-1 rounded border border-fl-border-2 bg-fl-bg px-1.5 py-0.5 font-mono text-[10px] text-fl-text outline-none"
      />
      <button
        type="button"
        onClick={onDelete}
        className="text-fl-text-faint transition-colors hover:text-red-500"
        title="ケースを削除"
      >
        ×
      </button>
    </div>
  );
}
