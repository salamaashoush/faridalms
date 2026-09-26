import type { ReactNode } from "react";

import { cn } from "~/utils/cn";

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

const dotTone: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  accent: "bg-primary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
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

export function StatusText({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] leading-[18px] whitespace-nowrap text-muted-foreground">
      <span className={cn("size-2 rounded-full", dotTone[tone])} aria-hidden />
      {children}
    </span>
  );
}
