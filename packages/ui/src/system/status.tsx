import type { ReactNode } from "react";

import { cn } from "../cn";

export type Tone =
  | "neutral"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "danger";

export const toneSurface: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-primary/10 text-primary",
  info: "bg-info/10 text-info",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning-foreground dark:text-warning",
  danger: "bg-destructive/10 text-destructive",
};

/** The dot that marks a tone beside its words. */
export const dotTone: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  accent: "bg-primary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

export interface StatusBadgeProps {
  tone: Tone;
  children: ReactNode;
  className?: string;
}

/** An object's lifecycle state: a tinted pill with a dot, read in words. */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        toneSurface[tone],
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", dotTone[tone])}
        aria-hidden
      />
      {children}
    </span>
  );
}

export interface StatusTextProps {
  tone: Tone;
  children: ReactNode;
}

/** A second status in a dense row: a dot and the word, without a pill. */
export function StatusText({ tone, children }: StatusTextProps) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] leading-[18px] whitespace-nowrap text-muted-foreground">
      <span className={cn("size-2 rounded-full", dotTone[tone])} aria-hidden />
      {children}
    </span>
  );
}
