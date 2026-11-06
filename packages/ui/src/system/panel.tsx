import type { ReactNode } from "react";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "../cn";
import { useId } from "react";

/** A labelled block in a side panel beside a canvas: the studio, a print preview. */
export interface PanelGroupProps {
  title: string;
  hint?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function PanelGroup({ title, hint, children, action }: PanelGroupProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid gap-3 border-b px-4 py-4 last:border-b-0"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id={id}
          className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {title}
        </h3>
        {action}
      </div>
      {hint ? (
        <p className="-mt-1 text-[13px] leading-[18px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
    </section>
  );
}

/** A small set of choices shown at once, one of them pressed. */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Shown instead of the label, which then names it for screen readers. */
  icon?: ReactNode;
}

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<T>) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const [picked] = next;
        if (picked) onChange(picked);
      }}
      className={cn("flex flex-wrap gap-1 rounded-lg bg-muted p-1", className)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          aria-label={option.icon ? option.label : undefined}
          title={option.icon ? option.label : undefined}
          className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-sm max-md:min-h-10"
        >
          {option.icon ?? option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
