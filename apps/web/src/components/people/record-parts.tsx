import type { ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import { Skeleton } from "@faridalms/ui/skeleton";
import { Suspense } from "react";

import { Value } from "~/components/app/primitives";
import {
  Fact,
  Facts,
  phoneLink,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { auditActionLabel } from "~/utils/audit-actions";
import { formatInstant } from "~/utils/datetime";

import { formatPhone } from "./format";

export function Phone({ value }: { value: string | null | undefined }) {
  if (!value) return <Value>{null}</Value>;
  return (
    <a
      href={`tel:${value}`}
      dir="ltr"
      className={cn("text-primary tabular-nums hover:underline", phoneLink)}
    >
      {formatPhone(value)}
    </a>
  );
}

export function Email({ value }: { value: string | null | undefined }) {
  if (!value) return <Value>{null}</Value>;
  return (
    <a
      href={`mailto:${value}`}
      dir="ltr"
      className={cn("text-primary hover:underline", phoneLink)}
    >
      {value}
    </a>
  );
}

export function Deferred({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full rounded-lg" />}>
      {children}
    </Suspense>
  );
}

interface Account {
  state: string;
  loginName: string | null;
  lastSignInAt: string | null;
}

export function AccountSection({
  account,
  description,
  none,
  action,
}: {
  account: Account | null;
  description: string;
  none: string;
  action?: ReactNode;
}) {
  return (
    <RecordSection
      title={m.studentSignInAccount()}
      description={description}
      action={action}
    >
      {account ? (
        <Facts>
          <Fact label={m.accountLoginName()}>
            {account.loginName ? (
              <span dir="ltr">{account.loginName}</span>
            ) : null}
          </Fact>
          <Fact label={m.accountState()}>
            <StatusText
              tone={account.state === "active" ? "success" : "neutral"}
            >
              {account.state === "active"
                ? m.accountActive()
                : account.state === "invited"
                  ? m.accountInvited()
                  : m.accountDisabled()}
            </StatusText>
          </Fact>
          <Fact label={m.accountLastSignIn()}>
            {account.lastSignInAt
              ? formatInstant(account.lastSignInAt, "medium")
              : m.accountNeverSignedIn()}
          </Fact>
        </Facts>
      ) : (
        <div className="grid gap-1">
          <StatusText tone="neutral">{m.studentNoAccount()}</StatusText>
          <RecordEmpty>{none}</RecordEmpty>
        </div>
      )}
    </RecordSection>
  );
}

interface Entry {
  id: string;
  occurredAt: string;
  action: string;
  actorNameEn: string | null;
  actorNameAr: string | null;
  reason?: string | null;
}

export function HistorySection({ entries }: { entries: Entry[] }) {
  return (
    <RecordSection
      title={m.recordHistory()}
      description={m.recordHistoryHint()}
    >
      {entries.length === 0 ? (
        <RecordEmpty>{m.recordHistoryEmpty()}</RecordEmpty>
      ) : (
        <RecordList>
          {entries.map((entry) => (
            <li key={entry.id} className="grid gap-0.5 py-3">
              <span className="text-sm leading-5 font-medium">
                {auditActionLabel(entry.action)}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {[
                  formatInstant(entry.occurredAt, "medium"),
                  entry.actorNameEn || entry.actorNameAr
                    ? inLocale(entry.actorNameEn, entry.actorNameAr)
                    : m.historySystem(),
                ].join(" · ")}
              </span>
              {entry.reason ? (
                <span dir="auto" className="text-sm leading-5">
                  {entry.reason}
                </span>
              ) : null}
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

const CONTACT_LABEL = {
  phone: m.familyMobile,
  email: m.adminEmail,
  postal: m.addressTitle,
} as const;

/** A person's phones, email addresses and address, each under what it is. */
export function ContactList({
  contacts,
}: {
  contacts: readonly {
    id: string;
    kind: keyof typeof CONTACT_LABEL;
    value: string;
    normalized: string | null;
  }[];
}) {
  return contacts.length === 0 ? (
    <RecordEmpty>{m.personNoContacts()}</RecordEmpty>
  ) : (
    <RecordList>
      {contacts.map((contact) => (
        <li key={contact.id} className="grid gap-0.5 py-3">
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {CONTACT_LABEL[contact.kind]()}
          </span>
          <span className="text-sm leading-5">
            {contact.kind === "phone" ? (
              <Phone value={contact.normalized ?? contact.value} />
            ) : contact.kind === "email" ? (
              <Email value={contact.value} />
            ) : (
              <bdi>{contact.value}</bdi>
            )}
          </span>
        </li>
      ))}
    </RecordList>
  );
}
