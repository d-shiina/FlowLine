import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Check } from 'lucide-react';

interface Props {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  accent?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Thin wrapper around Base UI's Checkbox primitive styled to match the
 * FLOWLINE dark theme. Renders a focusable 12×12 square with a
 * Lucide check icon via Checkbox.Indicator.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  accent = '#60a5fa',
  id,
  disabled,
}: Props) {
  return (
    <BaseCheckbox.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-sm border outline-none transition-colors disabled:opacity-40"
      style={{
        borderColor: checked ? accent : 'var(--fl-border-strong)',
        background: checked ? `${accent}33` : 'transparent',
      }}
    >
      <BaseCheckbox.Indicator>
        <Check className="h-2.5 w-2.5" style={{ color: accent }} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
