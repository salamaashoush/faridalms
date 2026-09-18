import type { ReactNode } from "react";

interface StatusPageProps {
  /** Shown large and muted above the title. Omitted for non-HTTP failures. */
  code?: string;
  icon?: ReactNode;
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function StatusPage({
  code,
  icon,
  title,
  description,
  actions,
  children,
}: StatusPageProps) {
  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        {icon ? (
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            {icon}
          </span>
        ) : null}
        {code ? (
          <p className="text-5xl font-semibold tracking-tight text-muted-foreground/40 tabular-nums">
            {code}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        {children}
        {actions ? (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
