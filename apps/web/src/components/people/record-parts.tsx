import type { HistoryChange } from "@faridalms/domain/history";
import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Skeleton } from "@faridalms/ui/skeleton";
import {
  Fact,
  Facts,
  phoneLink,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { Suspense } from "react";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { auditActionLabel } from "~/utils/audit-actions";
import { formatInstant } from "~/utils/datetime";

import { formatPhone } from "./format";
import { HistoryChanges } from "./history-changes";

export interface PhoneProps {
  value: string | null | undefined;
}

export function Phone({ value }: PhoneProps) {
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

export interface EmailProps {
  value: string | null | undefined;
}

export function Email({ value }: EmailProps) {
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

export interface DeferredProps {
  children: ReactNode;
}

export function Deferred({ children }: DeferredProps) {
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

export interface AccountSectionProps {
  account: Account | null;
  description: string;
  none: string;
  action?: ReactNode;
}

export function AccountSection({
  account,
  description,
  none,
  action,
}: AccountSectionProps) {
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
  changes: readonly HistoryChange[];
  reason?: string | null;
}

/** A record's history, a page at a time. */
export interface HistoryFeedProps {
  feed: {
    data: { pages: readonly { rows: Entry[] }[] };
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
  };
}

export function HistoryFeed({ feed }: HistoryFeedProps) {
  return (
    <HistorySection
      entries={feed.data.pages.flatMap((page) => page.rows)}
      more={
        feed.hasNextPage
          ? {
              pending: feed.isFetchingNextPage,
              onMore: () => void feed.fetchNextPage(),
            }
          : undefined
      }
    />
  );
}

interface HistorySectionProps {
  entries: Entry[];
  more?: { pending: boolean; onMore: () => void };
}

function HistorySection({ entries, more }: HistorySectionProps) {
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
              <HistoryChanges changes={entry.changes} />
              {entry.reason ? (
                <span dir="auto" className="text-sm leading-5">
                  {entry.reason}
                </span>
              ) : null}
            </li>
          ))}
        </RecordList>
      )}
      {more ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 justify-self-start max-md:h-10"
          disabled={more.pending}
          onClick={more.onMore}
        >
          {m.recordHistoryMore()}
        </Button>
      ) : null}
    </RecordSection>
  );
}

const CONTACT_LABEL = {
  phone: m.familyMobile,
  email: m.adminEmail,
  postal: m.addressTitle,
} as const;

/** A person's phones, email addresses and address, each under what it is. */
export interface ContactListProps {
  contacts: readonly {
    id: string;
    kind: keyof typeof CONTACT_LABEL;
    value: string;
    normalized: string | null;
  }[];
}

export function ContactList({ contacts }: ContactListProps) {
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
