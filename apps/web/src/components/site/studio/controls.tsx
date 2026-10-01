import type { ReactNode } from "react";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "@faridalms/ui/cn";
import { ChevronDown } from "lucide-react";
import { useId } from "react";

/** A labelled block in a studio panel. */
export function PanelGroup({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
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

/** A field in a studio panel: its label above the control, and a hint below. */
export function StudioField({
  id,
  label,
  hint,
  children,
  counter,
}: {
  id?: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  counter?: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        {id ? (
          <label htmlFor={id} className="text-sm leading-5 font-medium">
            {label}
          </label>
        ) : (
          <span className="text-sm leading-5 font-medium">{label}</span>
        )}
        {counter}
      </div>
      {children}
      {hint ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A small set of choices shown at once, one of them pressed. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
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

/** A disclosure inside a panel, closed until opened. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  actions,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-lg border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        {actions}
      </summary>
      <div className="grid gap-3 border-t px-3 py-3">{children}</div>
    </details>
  );
}
