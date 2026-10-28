import type { ReactNode } from 'react';

type Option<T extends string> = { value: T; label: string; icon?: ReactNode };

/** ラジオボタンによる選択（キーボードの矢印キー操作はブラウザ標準に任せる）。 */
export function SegmentedControl<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{legend}</legend>
      <div
        className="grid gap-1 rounded-md border border-border bg-surface-subtle p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <label
            key={o.value}
            className="relative flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 text-[13px] text-text-secondary transition-colors duration-[160ms] has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:text-accent-strong has-[:checked]:shadow-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.icon}
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
