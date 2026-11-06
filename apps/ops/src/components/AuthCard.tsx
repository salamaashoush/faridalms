import type { ReactNode } from "react";

import { ShieldCheck } from "lucide-react";

export interface AuthCardProps {
  title: string;
  description: string;
  children?: ReactNode;
}

/** A page outside the console's frame: signing in, or waiting for a role. */
export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 px-4 py-12">
      <div className="grid w-full max-w-sm gap-6 rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <span className="grid leading-tight">
            <span className="text-sm font-semibold">Farida</span>
            <span className="text-xs text-muted-foreground">Operations</span>
          </span>
        </div>
        <div className="grid gap-2">
          <h1 className="text-2xl leading-8 font-semibold tracking-tight">
            {title}
          </h1>
          <p className="text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
