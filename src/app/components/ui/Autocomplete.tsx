import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete as BaseAC } from '@base-ui/react/autocomplete';

export interface AutocompleteOption {
  value: string;
  label: string;
  group?: string;
  /** Secondary text shown alongside the label (e.g. node id). */
  description?: string;
}

interface Props {
  /** Currently selected option value (e.g. a node id). */
  value: string;
  /** Called when the user selects an item or clears the field. */
  onValueChange: (value: string) => void;
  options: AutocompleteOption[];
  placeholder?: string;
  /** Show a × button when a value is selected. */
  allowClear?: boolean;
}

/** Group options by `group`, preserving insertion order. */
function buildGroups(
  opts: AutocompleteOption[],
): Array<{ label: string; items: AutocompleteOption[] }> {
  const map = new Map<string, AutocompleteOption[]>();
  for (const o of opts) {
    const g = o.group ?? '';
    const arr = map.get(g);
    if (arr) arr.push(o);
    else map.set(g, [o]);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

/**
 * Thin wrapper around Base UI's Autocomplete primitive, styled to match
 * the FLOWLINE dark theme.
 *
 * Items are `{ value, label }` objects — Base UI auto-detects the shape
 * and uses `label` for display and filtering. A custom `filter` is added
 * so users can search by both label AND value (e.g. "desktop/click").
 *
 * `value` / `onValueChange` operate on option **values** (node IDs, etc.).
 * The parent is notified only on `item-press` (selection) or `clear-press`,
 * not on every keystroke.
 */
export function Autocomplete({
  value,
  onValueChange,
  options,
  placeholder = '(検索)',
  allowClear = false,
}: Props) {
  // Display text in the input. Shows the selected option's label (or the
  // raw value if no matching option exists, e.g. on first render).
  const resolveLabel = useCallback(
    (v: string) => {
      if (!v) return '';
      const opt = options.find((o) => o.value === v);
      return opt?.label ?? v;
    },
    [options],
  );

  const [inputText, setInputText] = useState(() => resolveLabel(value));

  // Track the last highlighted item so we can read the *object* value
  // when `item-press` fires (onValueChange only gives the display text).
  const highlightedRef = useRef<AutocompleteOption | null>(null);

  // Sync when the parent changes the selected value (step switching, etc.).
  useEffect(() => {
    setInputText(resolveLabel(value));
  }, [value, resolveLabel]);

  const groups = useMemo(() => buildGroups(options), [options]);

  // Custom filter: match against both label and value (node id).
  const filter = useCallback(
    (item: AutocompleteOption, query: string) => {
      const q = query.toLowerCase();
      return (
        item.label.toLowerCase().includes(q) ||
        item.value.toLowerCase().includes(q)
      );
    },
    [],
  );

  return (
    <BaseAC.Root
      items={options}
      value={inputText}
      onValueChange={(text, details) => {
        setInputText(text);

        if (details.reason === 'item-press') {
          // User clicked / pressed Enter on an item — propagate its value.
          const item = highlightedRef.current;
          if (item) {
            onValueChange(item.value);
          } else {
            // Fallback: match by label text
            const match = options.find((o) => o.label === text);
            if (match) onValueChange(match.value);
          }
        } else if (
          details.reason === 'clear-press' ||
          details.reason === 'input-clear'
        ) {
          onValueChange('');
        }
      }}
      onItemHighlighted={(itemValue) => {
        highlightedRef.current =
          (itemValue as AutocompleteOption) ?? null;
      }}
      filter={filter}
      openOnInputClick
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
              {groups.map((g) => (
                <BaseAC.Group key={g.label || '__default__'}>
                  {g.label && (
                    <BaseAC.GroupLabel className="sticky top-0 bg-fl-modal px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-fl-text-ghost">
                      {g.label}
                    </BaseAC.GroupLabel>
                  )}
                  {g.items.map((opt) => (
                    <BaseAC.Item
                      key={opt.value}
                      value={opt}
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
