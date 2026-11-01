import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@faridalms/ui/empty";
import { Inbox } from "lucide-react";

import * as m from "~/i18n/messages";

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
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {actions}
        </div>
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
// A value that cannot exist for this record, such as a grade for a student
// with no class, is a dash: "Not recorded" would suggest someone forgot it.
export function Value({
  children,
  notApplicable = false,
}: {
  children: ReactNode;
  notApplicable?: boolean;
}) {
  if (notApplicable)
    return (
      <span className="text-muted-foreground">
        <span aria-hidden>—</span>
        <span className="sr-only">{m.commonNotApplicable()}</span>
      </span>
    );
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
