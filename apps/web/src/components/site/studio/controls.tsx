import type { ReactNode } from "react";

import { ChevronDown } from "lucide-react";

export interface StudioFieldProps {
  id?: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  counter?: ReactNode;
}

/** A field in a studio panel: its label above the control, and a hint below. */
export function StudioField({
  id,
  label,
  hint,
  children,
  counter,
}: StudioFieldProps) {
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

export interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
}

/** A disclosure inside a panel, closed until opened. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  actions,
}: DisclosureProps) {
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
