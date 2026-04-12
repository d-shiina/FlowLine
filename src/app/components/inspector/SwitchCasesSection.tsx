import { useState } from 'react';

interface Props {
  cases: string[];
  onChange: (cases: string[]) => void;
}

/**
 * Manages the `cases` array for a switch step.
 * The `default` case is always present and cannot be renamed or removed.
 * New cases are inserted before `default`.
 */
export function SwitchCasesSection({ cases, onChange }: Props) {
  const [newCase, setNewCase] = useState('');

  const addCase = () => {
    const t = newCase.trim();
    if (!t || cases.includes(t)) return;
    // Insert before default
    const withoutDefault = cases.filter((c) => c !== 'default');
    const hasDefault = cases.includes('default');
    onChange([...withoutDefault, t, ...(hasDefault ? ['default'] : [])]);
    setNewCase('');
  };

  const removeCase = (c: string) => {
    onChange(cases.filter((x) => x !== c));
  };

  const rename = (old: string, next: string) => {
    if (!next.trim()) return;
    onChange(cases.map((c) => (c === old ? next.trim() : c)));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-fl-text-faint">
        CASES
      </div>

      <div className="flex flex-col gap-1">
        {cases.map((c) => (
          <div key={c} className="flex items-center gap-1">
            <input
              value={c}
              disabled={c === 'default'}
              onChange={(e) => rename(c, e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[11px] text-fl-text outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            {c !== 'default' && (
              <button
                type="button"
                onClick={() => removeCase(c)}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#ef444422] font-mono text-[10px] text-[#ef4444] transition-colors hover:bg-[#ef444440]"
                aria-label={`${c} を削除`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-1">
        <input
          value={newCase}
          onChange={(e) => setNewCase(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addCase();
          }}
          placeholder="新しいケース名"
          className="min-w-0 flex-1 rounded-md border border-dashed border-fl-border-strong bg-transparent px-2 py-1 font-mono text-[11px] text-fl-text outline-none placeholder:text-fl-text-ghost"
        />
        <button
          type="button"
          onClick={addCase}
          className="rounded-md border border-fl-border-strong bg-fl-panel-2 px-2 py-1 font-mono text-[10px] text-fl-text-muted transition-colors hover:border-fl-accent hover:text-fl-accent"
        >
          + 追加
        </button>
      </div>
    </div>
  );
}
