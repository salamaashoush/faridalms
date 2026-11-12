import type { HeaderFact, RecordTab } from "@faridalms/ui/system/record-page";
import type { ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import { initialsOf } from "@faridalms/ui/system/app-shell";
import { Page } from "@faridalms/ui/system/page";
import {
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
  RecordTabs,
} from "@faridalms/ui/system/record-page";
import {
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { useState } from "react";

import { groupWords } from "~/components/classes/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { personHistoryQuery, personRecordQuery } from "~/queries/students";
import { formatDate, formatList } from "~/utils/datetime";
import { useWords } from "~/utils/words";

import { classTitle } from "../classes/format";
import { AccessSection } from "./AccessSection";
import { ContactsSheet } from "./ContactsSheet";
import { displayName, labelOf, otherName, roleLabel } from "./format";
import { PhotoDialog } from "./PhotoDialog";
import { ContactList, Deferred, HistoryFeed } from "./record-parts";
import { SignInSection } from "./SignInSection";
import { personRecordParts } from "./slots";

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

interface RolesSectionProps {
  data: PersonData;
}

function RolesSection({ data }: RolesSectionProps) {
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

interface ContactsSectionProps {
  contacts: NonNullable<PersonData["contacts"]>;
  onEdit?: () => void;
}

function ContactsSection({ contacts, onEdit }: ContactsSectionProps) {
  return (
    <RecordSection
      title={m.personContactDetails()}
      edit={onEdit ? { label: m.contactsEdit(), onClick: onEdit } : undefined}
    >
      <ContactList contacts={contacts} />
    </RecordSection>
  );
}

export interface TeachingSectionProps {
  teaching: NonNullable<PersonData["teaching"]>;
  title?: string;
  empty?: string;
}

/** The classes someone teaches; a profile names them for the viewer and opens none. */
export function TeachingSection({
  teaching,
  title = m.personTeaching(),
  empty,
}: TeachingSectionProps) {
  const words = useSlot(groupWords);
  const inWords = useWords();
  return (
    <RecordSection
      title={title}
      description={
        teaching.within
          ? m.personTeachingWithin({
              name: inLocale(teaching.within.titleEn, teaching.within.titleAr),
            })
          : m.personTeachingToday()
      }
    >
      {teaching.classes.length === 0 ? (
        <RecordEmpty>{empty ?? inWords(m.personNoTeachingCore)()}</RecordEmpty>
      ) : (
        <RecordList>
          {teaching.classes.map((row) => {
            const group =
              row.group && !row.group.own
                ? inLocale(row.group.titleEn, row.group.titleAr)
                : "";
            const detail = row.group?.own
              ? (words[0]?.teacher() ?? m.classesClassTeacher())
              : formatList(
                  [
                    labelOf(row.subject),
                    group ? m.personTeachingIn({ class: group }) : null,
                  ].filter((part): part is string => Boolean(part)),
                );
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
              >
                <div className="grid min-w-0 gap-0.5">
                  {row.canOpen ? (
                    <Link
                      to="/classes/$classId"
                      params={{ classId: row.id }}
                      search={{}}
                      dir="auto"
                      className={cn(
                        "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
                        phoneLink,
                      )}
                    >
                      {classTitle(row)}
                    </Link>
                  ) : (
                    <span dir="auto" className="text-sm leading-5 font-medium">
                      {classTitle(row)}
                    </span>
                  )}
                  {detail ? (
                    <span
                      dir="auto"
                      className="text-[13px] leading-[18px] text-muted-foreground"
                    >
                      {detail}
                    </span>
                  ) : null}
                </div>
                {row.role === "aide" ? (
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {m.personTeachingAide()}
                  </span>
                ) : null}
              </li>
            );
          })}
        </RecordList>
      )}
    </RecordSection>
  );
}

interface PersonHistoryProps {
  userId: string;
}

function PersonHistory({ userId }: PersonHistoryProps) {
  const feed = useSuspenseInfiniteQuery(personHistoryQuery(userId));
  return <HistoryFeed feed={feed} />;
}

export interface PersonRecordProps {
  userId: string;
  tab: PersonTab;
  onTab: (tab: PersonTab) => void;
}

export function PersonRecord({ userId, tab, onTab }: PersonRecordProps) {
  const data = useSuspenseQuery(personRecordQuery(userId)).data;
  const personParts = useSlot(personRecordParts);
  const queryClient = useQueryClient();
  const [photoOpen, setPhotoOpen] = useState(false);
  const [editing, setEditing] = useState({ open: false, key: 0 });
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
              {data.teaching ? (
                <TeachingSection teaching={data.teaching} />
              ) : null}
              {personParts.map((part, index) => (
                <Deferred key={index}>
                  <part.Overview
                    personId={data.id}
                    roles={data.roles.map((role) => role.role)}
                  />
                </Deferred>
              ))}
            </>
          }
          aside={
            data.contacts ? (
              <ContactsSection
                contacts={data.contacts}
                onEdit={
                  data.access.contacts
                    ? () =>
                        setEditing((current) => ({
                          open: true,
                          key: current.key + 1,
                        }))
                    : undefined
                }
              />
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
              emailLink
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
    <Page width="record">
      <RecordHeader
        title={name}
        initials={initialsOf(name)}
        photoUrl={data.photoFileId ? `/files/${data.photoFileId}` : null}
        onPhoto={data.access.photo ? () => setPhotoOpen(true) : undefined}
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
      {data.access.contacts && data.contacts ? (
        <ContactsSheet
          key={editing.key}
          userId={userId}
          name={name}
          contacts={data.contacts}
          open={editing.open}
          onClose={() => setEditing((current) => ({ ...current, open: false }))}
        />
      ) : null}
      {data.access.photo ? (
        <PhotoDialog
          personId={userId}
          name={name}
          photoUrl={data.photoFileId ? `/files/${data.photoFileId}` : null}
          open={photoOpen}
          onOpenChange={setPhotoOpen}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["people"] });
            // One's own photo also shows in the menu.
            if (data.access.self)
              void queryClient.invalidateQueries({ queryKey: ["user"] });
          }}
        />
      ) : null}
    </Page>
  );
}
