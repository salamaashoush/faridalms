import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Inbox } from "lucide-react";

import { Card, CardContent } from "~/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "~/components/ui/empty";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/**
 * A field value that can legitimately be absent.
 *
 * The old portal printed a label and then nothing, so a parent could not tell
 * a missing birthdate from a rendering bug. Absence is stated, in words.
 */
export function Value({ children }: { children: ReactNode }) {
  const empty =
    children === null ||
    children === undefined ||
    children === "" ||
    (typeof children === "string" && children.trim() === "");

  if (empty) {
    return (
      <span className="text-muted-foreground italic">
        {m.commonNotRecorded()}
      </span>
    );
  }
  return <>{children}</>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm">
        <Value>{children}</Value>
      </dd>
    </div>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </dl>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  compact = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "warning" | "critical";
  compact?: boolean;
}) {
  const toneClass = {
    default: "text-foreground",
    positive: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
    critical: "text-destructive",
  }[tone];

  return (
    <Card className="gap-0 rounded-2xl border-border/80 py-0 shadow-[0_2px_8px_#233d2a04]">
      <CardContent
        className={cn(
          "flex items-start justify-between gap-4",
          compact ? "p-4" : "p-5",
        )}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p
            className={cn(
              "mt-3 text-3xl font-semibold tracking-tight tabular-nums",
              toneClass,
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
        {Icon ? (
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary",
              compact && "hidden",
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  body,
  icon: Icon = Inbox,
  action,
}: {
  title?: string;
  body?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <Empty className="border border-border bg-card py-14">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className="size-5" aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title ?? m.commonEmptyTitle()}</EmptyTitle>
        <EmptyDescription>{body ?? m.commonEmptyBody()}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden rounded-2xl border-border/80 py-0 shadow-[0_2px_8px_#233d2a04]",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}
