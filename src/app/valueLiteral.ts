/**
 * Shared value-literal parser/formatter used by the Variables modal
 * and the Inspector's in-port literal editor.
 *
 * The editor contract is "type the value as you'd type it in a
 * config file" — numbers are numbers, booleans are booleans, JSON
 * is JSON, and anything else is a string. The user never picks a
 * type explicitly.
 *
 * Rules:
 *
 * - `42`          → number 42
 * - `3.14`        → number 3.14
 * - `true|false`  → boolean
 * - `null`        → null
 * - `[1,2]`       → array
 * - `{"x":1}`     → object
 * - `"hello"`     → string "hello" (explicit JSON quoting)
 * - `hello`       → string "hello" (bare fallback)
 * - empty input   → empty string
 *
 * Round-trip guarantee: ``format(parse(s)) === s`` for any string
 * ``s`` the user typed. The formatter quotes strings that would
 * otherwise be re-parsed as non-strings (e.g. a string ``"42"`` is
 * displayed as ``"42"`` with quotes so it doesn't collapse to the
 * number 42 on the next save).
 */

/**
 * Parse a raw editor string into a JSON-compatible runtime value.
 * Never throws; invalid JSON falls through as a plain string.
 */
export function parseLiteral(raw: string): unknown {
  if (raw === '') return '';
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/**
 * Format a runtime value into the editor-friendly string the user
 * would type to produce it. Strings are shown bare unless they
 * would re-parse as something else (numbers, booleans, JSON).
 */
export function formatLiteral(value: unknown): string {
  if (value === undefined || value === null) {
    return value === null ? 'null' : '';
  }
  if (typeof value === 'string') {
    if (value === '') return '';
    // If the raw string would re-parse as a non-string (42 → number,
    // "true" → boolean, "[1]" → array) we have to quote it so the
    // next parse keeps it a string. Plain words (hello, foo bar)
    // fall through as-is.
    try {
      const reparsed = JSON.parse(value) as unknown;
      if (typeof reparsed !== 'string') {
        return JSON.stringify(value);
      }
    } catch {
      /* not valid JSON → safe to show bare */
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // Objects, arrays, anything exotic.
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Human-readable type tag for a runtime value. Used by the debug
 * badge next to Variables rows so users can see at a glance how
 * their input was interpreted without surfacing a type picker.
 */
export function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'object') return 'object';
  return t;
}
