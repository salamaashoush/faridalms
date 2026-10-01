import type { ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Pencil } from "lucide-react";

import type { HeaderFact, RecordTab } from "~/components/system/RecordPage";

import { initialsOf } from "~/components/app/UserMenu";
import { formatDate } from "~/components/family/format";
import {
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
  RecordTabs,
} from "~/components/system/RecordPage";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { personHistoryQuery, personRecordQuery } from "~/queries/students";
import { formatList } from "~/utils/datetime";

import { AccessSection } from "./AccessSection";
import { displayName, labelOf, otherName, roleLabel } from "./format";
import { Deferred, Email, HistorySection, Phone } from "./record-parts";
import { SignInSection } from "./SignInSection";

export const PERSON_TABS = [
  "overview",
  "access",
  "account",
  "history",
] as const;
export type PersonTab = (typeof PERSON_TABS)[number];

const TAB_LABEL: Record<PersonTab, () => string> = {
  overview: m.recordOverview,
  access: m.accessTab,
  account: m.studentTabAccount,
  history: m.recordHistory,
};

export type PersonData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof personRecordQuery>["queryFn"]>>
>;

export function personTabsFor(
  access: PersonData["access"],
): Record<PersonTab, boolean> {
  return {
    overview: true,
    access: access.roles,
    account: access.manage || access.self || access.signIn,
    history: access.history,
  };
}

function RolesSection({ data }: { data: PersonData }) {
  return (
    <RecordSection title={m.personRoles()}>
      {data.roles.length === 0 ? (
        <RecordEmpty>{m.personNoRoles()}</RecordEmpty>
      ) : (
        <RecordList>
          {data.roles.map((role) => {
            const title =
              inLocale(role.titleEn, role.titleAr) ||
              labelOf(role.position) ||
              null;
            return (
              <li
                key={role.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
              >
                <div className="grid min-w-0 gap-0.5">
                  <span className="text-sm leading-5 font-medium">
                    {roleLabel(role.role)}
                  </span>
                  {title ? (
                    <span
                      dir="auto"
                      className="text-[13px] leading-[18px] text-muted-foreground"
                    >
                      {title}
                    </span>
                  ) : null}
                </div>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {m.personSince({ date: formatDate(role.from) })}
                </span>
              </li>
            );
          })}
        </RecordList>
      )}
    </RecordSection>
  );
}

function ContactsSection({
  contacts,
}: {
  contacts: NonNullable<PersonData["contacts"]>;
}) {
  return (
    <RecordSection title={m.personContactDetails()}>
      {contacts.length === 0 ? (
        <RecordEmpty>{m.personNoContacts()}</RecordEmpty>
      ) : (
        <RecordList>
          {contacts.map((contact) => (
            <li key={contact.id} className="grid gap-0.5 py-3">
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {contact.kind === "phone" ? m.familyMobile() : m.adminEmail()}
              </span>
              <span className="text-sm leading-5">
                {contact.kind === "phone" ? (
                  <Phone value={contact.normalized ?? contact.value} />
                ) : (
                  <Email value={contact.value} />
                )}
              </span>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

function ChildrenSection({ data }: { data: PersonData }) {
  return (
    <RecordSection title={m.personChildren()}>
      {data.children.length === 0 ? (
        <RecordEmpty>{m.personNoChildren()}</RecordEmpty>
      ) : (
        <RecordList>
          {data.children.map((child) => (
            <li
              key={child.relationshipId}
              className="flex items-start gap-3 py-3"
            >
              <span
                aria-hidden
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
              >
                {initialsOf(displayName(child))}
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <Link
                  to="/students/$studentId"
                  params={{ studentId: child.studentId }}
                  search={{}}
                  dir="auto"
                  className={cn(
                    "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
                    phoneLink,
                  )}
                >
                  {displayName(child)}
                </Link>
                {child.relation ? (
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {labelOf(child.relation)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

function PersonHistory({ userId }: { userId: string }) {
  const entries = useSuspenseQuery(personHistoryQuery(userId)).data;
  return <HistorySection entries={entries} />;
}

export function PersonRecord({
  userId,
  tab,
  onTab,
}: {
  userId: string;
  tab: PersonTab;
  onTab: (tab: PersonTab) => void;
}) {
  const data = useSuspenseQuery(personRecordQuery(userId)).data;
  const navigate = useNavigate();
  const name = displayName(data);
  const available = personTabsFor(data.access);
  const tabs: RecordTab<PersonTab>[] = PERSON_TABS.filter(
    (value) => available[value],
  ).map((value) => ({ value, label: TAB_LABEL[value]() }));
  const active = available[tab] ? tab : "overview";

  const facts: HeaderFact[] = [];
  const second = otherName(data);
  if (second)
    facts.push({
      label: m.peopleOtherName(),
      value: <span dir="auto">{second}</span>,
    });
  const held = [...new Set(data.roles.map((role) => role.role))];
  if (held.length)
    facts.push({
      label: m.personRoles(),
      value: formatList(held.map(roleLabel)),
    });

  let body: ReactNode;
  switch (active) {
    case "overview":
      body = (
        <RecordColumns
          main={
            <>
              <RolesSection data={data} />
              {data.children.length > 0 ||
              data.roles.some((role) => isFamily(role.role)) ? (
                <ChildrenSection data={data} />
              ) : null}
            </>
          }
          aside={
            data.contacts ? (
              <ContactsSection contacts={data.contacts} />
            ) : undefined
          }
        />
      );
      break;
    case "access":
      body = (
        <RecordColumns
          main={
            <Deferred>
              <AccessSection userId={userId} name={name} today={data.today} />
            </Deferred>
          }
        />
      );
      break;
    case "account":
      body = (
        <RecordColumns
          main={
            <SignInSection
              userId={userId}
              name={name}
              account={data.account}
              manage={data.access.signIn}
              suggestedLogin={
                data.contacts?.find((contact) => contact.kind === "email")
                  ?.value ?? ""
              }
              description={m.personAccountHint()}
              none={m.personAccountNone()}
            />
          }
        />
      );
      break;
    case "history":
      body = (
        <RecordColumns
          main={
            <Deferred>
              <PersonHistory userId={userId} />
            </Deferred>
          }
        />
      );
      break;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <RecordHeader
        title={name}
        initials={initialsOf(name)}
        facts={facts}
        action={
          data.access.staff
            ? {
                label: m.staffEdit(),
                icon: Pencil,
                onClick: () =>
                  void navigate({
                    to: "/staff-editor",
                    search: { id: userId, from: "record" },
                  }),
              }
            : undefined
        }
      />
      {tabs.length > 1 ? (
        <RecordTabs
          label={m.personRecordSections()}
          tabs={tabs}
          value={active}
          onChange={onTab}
        >
          {body}
        </RecordTabs>
      ) : (
        body
      )}
    </div>
  );
}

function isFamily(role: string) {
  return role === "parent" || role === "guardian" || role === "relative";
}
