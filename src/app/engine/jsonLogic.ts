/**
 * Minimal JSON Logic evaluator for FLOWLINE's built-in loop / branch
 * conditions. Implements the subset of https://jsonlogic.com/ that a
 * scenario author realistically needs: variable lookup, comparisons,
 * boolean combinators, arithmetic, and the `if` / `cat` helpers.
 *
 * We intentionally don't pull in `json-logic-js` as a dependency —
 * the library is ~2 KB minified but brings its own evaluator quirks
 * (e.g. strict equality semantics that differ from ours) and this
 * tiny in-repo version keeps the rules auditable and lets us surface
 * clean error messages back into the engine logs.
 *
 * Unsupported operators degrade to `false` with a warning delivered
 * through the `onWarn` callback so the scenario can still limp along
 * and the user sees the problem in the ExecutionLogPanel.
 */

export type JsonLogicExpr = unknown;

export interface EvalOptions {
  /** Look up a scenario/track variable by flat dotted key. */
  getVariable: (key: string) => unknown;
  /** Non-fatal warning sink, e.g. "unknown operator 'foo'". */
  onWarn?: (message: string) => void;
}

/**
 * Evaluate a JSON Logic expression against the executor's variable
 * store. Primitives pass through unchanged; objects with exactly
 * one key are treated as operator invocations. Arrays are mapped
 * element-wise.
 */
export function evalJsonLogic(
  expr: JsonLogicExpr,
  opts: EvalOptions,
): unknown {
  if (expr === null || expr === undefined) return expr;
  if (typeof expr !== 'object') return expr;
  if (Array.isArray(expr)) {
    return expr.map((e) => evalJsonLogic(e, opts));
  }
  const keys = Object.keys(expr as Record<string, unknown>);
  if (keys.length !== 1) return expr;
  const op = keys[0];
  const rawArgs = (expr as Record<string, unknown>)[op];
  // Most ops take an array of arguments, but a few one-argument ops
  // (var, !, !!) accept a bare value for ergonomics.
  const args: unknown[] = Array.isArray(rawArgs) ? rawArgs : [rawArgs];

  switch (op) {
    case 'var': {
      const key = evalJsonLogic(args[0], opts);
      if (typeof key !== 'string') return undefined;
      const v = opts.getVariable(key);
      // JSON Logic returns the second arg as a default when the
      // variable is missing, matching upstream behaviour.
      if (v === undefined && args.length > 1) {
        return evalJsonLogic(args[1], opts);
      }
      return v;
    }

    case '==':
      return looseEquals(
        evalJsonLogic(args[0], opts),
        evalJsonLogic(args[1], opts),
      );
    case '===':
      return evalJsonLogic(args[0], opts) === evalJsonLogic(args[1], opts);
    case '!=':
      return !looseEquals(
        evalJsonLogic(args[0], opts),
        evalJsonLogic(args[1], opts),
      );
    case '!==':
      return evalJsonLogic(args[0], opts) !== evalJsonLogic(args[1], opts);

    case '>':
      return num(evalJsonLogic(args[0], opts)) > num(evalJsonLogic(args[1], opts));
    case '>=':
      return num(evalJsonLogic(args[0], opts)) >= num(evalJsonLogic(args[1], opts));
    case '<':
      return num(evalJsonLogic(args[0], opts)) < num(evalJsonLogic(args[1], opts));
    case '<=':
      return num(evalJsonLogic(args[0], opts)) <= num(evalJsonLogic(args[1], opts));

    case '!':
    case 'not':
      return !truthy(evalJsonLogic(args[0], opts));
    case '!!':
      return truthy(evalJsonLogic(args[0], opts));

    case 'and': {
      let last: unknown = true;
      for (const a of args) {
        last = evalJsonLogic(a, opts);
        if (!truthy(last)) return last;
      }
      return last;
    }
    case 'or': {
      let last: unknown = false;
      for (const a of args) {
        last = evalJsonLogic(a, opts);
        if (truthy(last)) return last;
      }
      return last;
    }

    case '+':
      return args
        .map((a) => num(evalJsonLogic(a, opts)))
        .reduce((sum, n) => sum + n, 0);
    case '-': {
      const xs = args.map((a) => num(evalJsonLogic(a, opts)));
      if (xs.length === 1) return -xs[0];
      return xs.slice(1).reduce((acc, n) => acc - n, xs[0]);
    }
    case '*':
      return args
        .map((a) => num(evalJsonLogic(a, opts)))
        .reduce((prod, n) => prod * n, 1);
    case '/': {
      const xs = args.map((a) => num(evalJsonLogic(a, opts)));
      if (xs.length === 0) return 0;
      return xs.slice(1).reduce((acc, n) => acc / n, xs[0]);
    }
    case '%': {
      const a = num(evalJsonLogic(args[0], opts));
      const b = num(evalJsonLogic(args[1], opts));
      return a % b;
    }

    case 'in': {
      const needle = evalJsonLogic(args[0], opts);
      const hay = evalJsonLogic(args[1], opts);
      if (typeof hay === 'string' && typeof needle === 'string') {
        return hay.includes(needle);
      }
      if (Array.isArray(hay)) return hay.includes(needle);
      return false;
    }

    case 'cat':
      return args
        .map((a) => {
          const v = evalJsonLogic(a, opts);
          return v === null || v === undefined ? '' : String(v);
        })
        .join('');

    case 'if': {
      // Chained if/elseif/else pairs: [cond, then, cond, then, ..., else]
      let i = 0;
      while (i + 1 < args.length) {
        if (truthy(evalJsonLogic(args[i], opts))) {
          return evalJsonLogic(args[i + 1], opts);
        }
        i += 2;
      }
      return i < args.length ? evalJsonLogic(args[i], opts) : undefined;
    }

    default:
      opts.onWarn?.(`unknown JSON Logic operator: ${op}`);
      return false;
  }
}

/**
 * Coerce a value to a number the same way JSON Logic does upstream:
 * `true` → 1, `false` → 0, numeric strings parse, everything else
 * degrades to NaN (which makes `>` / `<` return false deterministically).
 */
function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? NaN : n;
  }
  return NaN;
}

/**
 * Truthiness compatible with upstream JSON Logic:
 * empty strings / arrays and `0` are falsy; everything else follows
 * JavaScript defaults.
 */
function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return v !== 0;
  return !!v;
}

/** Loose equality mirroring `==` semantics — matches JSON Logic upstream. */
function looseEquals(a: unknown, b: unknown): boolean {
  // Normalise nullish to null so `null == undefined` holds.
  const na = a === undefined ? null : a;
  const nb = b === undefined ? null : b;
  if (na === nb) return true;
  if (na === null || nb === null) return false;
  if (typeof na === 'number' && typeof nb === 'string') return na === Number(nb);
  if (typeof na === 'string' && typeof nb === 'number') return Number(na) === nb;
  if (typeof na === 'boolean') return looseEquals(na ? 1 : 0, nb);
  if (typeof nb === 'boolean') return looseEquals(na, nb ? 1 : 0);
  return false;
}

/**
 * Helper used by the executor's branch block: evaluate a condition
 * and return a boolean, with warnings routed into the engine log.
 */
export function evalBool(
  expr: JsonLogicExpr,
  opts: EvalOptions,
): boolean {
  return truthy(evalJsonLogic(expr, opts));
}
