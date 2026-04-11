import { Select as BaseSelect } from '@base-ui/react/select';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SelectOption<T>[];
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
}

/**
 * Thin wrapper around Base UI's Select primitive, styled to match the
 * FLOWLINE dark theme. Provides a simple `options`-based API that matches
 * the native <select> ergonomics while getting proper popup rendering,
 * keyboard handling and a11y from Base UI.
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  className,
  triggerClassName,
  placeholder = '(選択)',
}: Props<T>) {
  return (
    <BaseSelect.Root<T>
      value={value}
      onValueChange={(v) => {
        if (v !== null) onValueChange(v as T);
      }}
    >
      <BaseSelect.Trigger
        className={
          triggerClassName ??
          'flex w-full items-center justify-between rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1 font-mono text-[11px] text-slate-200 outline-none transition-colors hover:border-[#475569] data-[popup-open]:border-[#3B82F6]'
        }
      >
        <BaseSelect.Value>
          {(v: T) => {
            const found = options.find((o) => o.value === v);
            return (
              <span className={found ? '' : 'text-slate-600'}>
                {found?.label ?? placeholder}
              </span>
            );
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon>
          <ChevronDown className="h-3 w-3 text-slate-500" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-[250] outline-none">
          <BaseSelect.Popup
            className={
              className ??
              'max-h-[280px] min-w-[var(--anchor-width)] overflow-y-auto rounded-md border border-[#334155] bg-[#1a2235] py-1 font-mono text-[11px] text-slate-200 shadow-2xl outline-none'
            }
          >
            {options.map((opt) => (
              <BaseSelect.Item
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className="flex cursor-pointer items-center gap-2 px-2 py-1.5 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-[#3B82F620] data-[selected]:text-[#60a5fa]"
              >
                <BaseSelect.ItemIndicator className="w-3">
                  <Check className="h-3 w-3" />
                </BaseSelect.ItemIndicator>
                <BaseSelect.ItemText>{opt.label}</BaseSelect.ItemText>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
