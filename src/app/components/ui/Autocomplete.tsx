import { useEffect, useMemo, useState } from 'react';
import { Autocomplete as BaseAC } from '@base-ui/react/autocomplete';

export interface AutocompleteOption {
  value: string;
  label: string;
  group?: string;
  /** Secondary text shown alongside the label (e.g. node id). */
  description?: string;
}

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  options: AutocompleteOption[];
  placeholder?: string;
  /** Show a × button when a value is selected. */
  allowClear?: boolean;
}

/** Group options by their `group` field, preserving insertion order. */
function groupBy(
  opts: AutocompleteOption[],
): Array<[string, AutocompleteOption[]]> {
  const map = new Map<string, AutocompleteOption[]>();
  for (const o of opts) {
    const g = o.group ?? '';
    const arr = map.get(g);
    if (arr) arr.push(o);
    else map.set(g, [o]);
  }
  return Array.from(map.entries());
}

/**
 * Thin wrapper around Base UI's Autocomplete primitive, styled to match the
 * FLOWLINE dark theme. Options are grouped by the `group` field and rendered
 * with an optional `description` alongside the label.
 *
 * `value` / `onValueChange` operate on option **values** (e.g. node IDs).
 * The parent is only notified when the user selects a valid option or clears
 * the field — not on every keystroke.
 */
export function Autocomplete({
  value,
  onValueChange,
  options,
  placeholder = '(検索)',
  allowClear = false,
}: Props) {
  // inputText is what the user sees in the input. Starts as the current value
  // (e.g. "desktop/click"); updated as the user types or selects.
  const [inputText, setInputText] = useState(value);

  // Keep the displayed text in sync when the selected value changes from
  // outside (e.g. switching between steps).
  useEffect(() => {
    setInputText(value);
  }, [value]);

  const grouped = useMemo(() => groupBy(options), [options]);

  return (
    <BaseAC.Root
      items={options.map((o) => o.value)}
      value={inputText}
      onValueChange={(v) => {
        setInputText(v);
        // Only propagate to parent when an exact option is selected or cleared.
        if (v === '' || options.some((o) => o.value === v)) {
          onValueChange(v);
        }
      }}
    >
      <BaseAC.InputGroup className="flex items-center overflow-hidden rounded-md border border-fl-border-strong bg-fl-panel-2 transition-colors focus-within:border-fl-accent">
        <BaseAC.Input
          className="min-w-0 flex-1 bg-transparent px-2 py-1 font-mono text-[11px] text-fl-text outline-none placeholder:text-fl-text-ghost"
          placeholder={placeholder}
        />
        {allowClear && value && (
          <BaseAC.Clear
            className="px-1.5 font-mono text-[11px] text-fl-text-faint transition-colors hover:text-fl-text"
            aria-label="クリア"
          >
            ×
          </BaseAC.Clear>
        )}
      </BaseAC.InputGroup>

      <BaseAC.Portal>
        <BaseAC.Positioner sideOffset={4} className="z-[250] outline-none">
          <BaseAC.Popup className="max-h-[280px] min-w-[var(--anchor-width)] overflow-y-auto rounded-md border border-fl-border-strong bg-fl-modal py-1 font-mono text-[11px] shadow-2xl outline-none">
            <BaseAC.List>
              {grouped.map(([groupName, items]) => (
                <BaseAC.Group key={groupName || '__default__'}>
                  {groupName && (
                    <BaseAC.GroupLabel className="sticky top-0 bg-fl-modal px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-fl-text-ghost">
                      {groupName}
                    </BaseAC.GroupLabel>
                  )}
                  {items.map((opt) => (
                    <BaseAC.Item
                      key={opt.value}
                      value={opt.value}
                      className="flex cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-fl-text-muted outline-none data-[highlighted]:bg-[#3b82f620] data-[selected]:text-fl-accent"
                    >
                      <span>{opt.label}</span>
                      {opt.description && (
                        <span className="shrink-0 font-mono text-[9px] text-fl-text-ghost">
                          {opt.description}
                        </span>
                      )}
                    </BaseAC.Item>
                  ))}
                </BaseAC.Group>
              ))}
            </BaseAC.List>
            <BaseAC.Empty className="px-2 py-3 text-center font-mono text-[10px] text-fl-text-faint">
              見つかりません
            </BaseAC.Empty>
          </BaseAC.Popup>
        </BaseAC.Positioner>
      </BaseAC.Portal>
    </BaseAC.Root>
  );
}
