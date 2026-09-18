import { useId } from "react";

import { cn } from "~/utils/cn";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Real radio inputs rather than a select: the whole option set is short enough
 * to show at once, and every choice is a linkable URL state.
 */
export function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ChipOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const groupName = useId();

  return (
    <fieldset className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "relative cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {/* The input covers the whole chip rather than hiding in a corner,
                so a pointer lands on the control itself, not on the label. */}
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-full opacity-0"
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}
