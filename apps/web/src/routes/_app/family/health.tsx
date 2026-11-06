import type { FamilyHealthKind } from "@faridalms/domain/people";

import { FAMILY_HEALTH_KINDS } from "@faridalms/domain/people";
import { Button } from "@faridalms/ui/button";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { PageHeader } from "@faridalms/ui/system/page-header";
import {
  RecordColumns,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { HeartPulse, Pencil, Plus, Users } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import type { Asking } from "~/components/health/ChangeSheet";

import { ChangeSheet } from "~/components/health/ChangeSheet";
import {
  CHANGE_STATE,
  KIND_EMPTY,
  KIND_ONE,
  KIND_SECTION,
  SEVERITY_LABEL,
  valueLine,
} from "~/components/health/labels";
import { displayName, labelOf } from "~/components/people/format";
import { FileList } from "~/components/system/FileList";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { familyHealthQuery } from "~/queries/records";
import { personRecordQuery } from "~/queries/students";
import { currentUserQuery } from "~/queries/user";
import { formatDate } from "~/utils/datetime";

export const Route = createFileRoute("/_app/family/health")({
  staticData: {
    breadcrumb: m.medicalTitleShort,
    section: "/family/children",
  },
  validateSearch: v.object({
    studentId: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    const me = await context.queryClient.ensureQueryData(
      personRecordQuery(user.id),
    );
    const child = deps.studentId ?? me.children[0]?.studentId;
    if (child)
      await context.queryClient.ensureQueryData(familyHealthQuery(child));
  },
  component: FamilyHealthPage,
});

type Summary = Extract<
  Awaited<
    ReturnType<NonNullable<ReturnType<typeof familyHealthQuery>["queryFn"]>>
  >,
  { permitted: true }
>;

function Summary({
  studentId,
  name,
  summary,
}: {
  studentId: string;
  name: string;
  summary: Summary;
}) {
  const [asking, setAsking] = useState<{ key: number; value: Asking | null }>({
    key: 0,
    value: null,
  });
  const ask = (value: Asking) =>
    setAsking((current) => ({ key: current.key + 1, value }));
  const waiting = (match: (change: Summary["changes"][number]) => boolean) =>
    summary.changes.some((change) => change.state === "open" && match(change));
  const section = (kind: FamilyHealthKind) => {
    const records = summary.records.filter((record) => record.kind === kind);
    const single = kind === "doctor" && records.length > 0;
    return (
      <RecordSection
        key={kind}
        title={KIND_SECTION[kind]()}
        action={
          single ? undefined : (
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-10"
              onClick={() => ask({ target: "record", kind, record: null })}
            >
              <Plus aria-hidden />
              {m.medicalAskAdd()}
            </Button>
          )
        }
      >
        {records.length === 0 ? (
          <RecordEmpty>{KIND_EMPTY[kind]()}</RecordEmpty>
        ) : (
          <RecordList>
            {records.map((record) => (
              <li key={record.id} className="flex items-start gap-3 py-3">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-sm leading-5 font-medium">
                    <bdi>{record.text}</bdi>
                  </span>
                  {record.severity ? (
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {SEVERITY_LABEL[record.severity]()}
                    </span>
                  ) : null}
                  {record.report?.shared ? (
                    <div className="mt-2">
                      <FileList
                        files={[
                          {
                            id: record.report.fileId,
                            name: record.report.name,
                            mediaType: record.report.mediaType,
                            sizeBytes: record.report.sizeBytes,
                          },
                        ]}
                      />
                    </div>
                  ) : record.report ? (
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {m.medicalReportHeld()}
                    </span>
                  ) : null}
                  {waiting((change) => change.recordId === record.id) ? (
                    <StatusText tone="warning">
                      {m.medicalChangeWaiting()}
                    </StatusText>
                  ) : null}
                </div>
                <ActionMenu
                  label={m.medicalActions({ record: record.text })}
                  actions={[
                    {
                      label: m.medicalAskChange(),
                      icon: Pencil,
                      onSelect: () => ask({ target: "record", kind, record }),
                    },
                  ]}
                />
              </li>
            ))}
          </RecordList>
        )}
      </RecordSection>
    );
  };
  return (
    <>
      <RecordColumns
        main={
          <>
            {FAMILY_HEALTH_KINDS.map(section)}
            <RecordSection
              title={m.medicalContacts()}
              description={m.medicalContactsHint()}
            >
              {summary.contacts.length === 0 ? (
                <RecordEmpty>{m.medicalNoContacts()}</RecordEmpty>
              ) : (
                <RecordList>
                  {summary.contacts.map((contact) => {
                    const contactName = displayName(contact);
                    return (
                      <li
                        key={contact.relationshipId}
                        className="flex items-start gap-3 py-3"
                      >
                        <div className="grid min-w-0 flex-1 gap-0.5">
                          <span className="text-sm leading-5 font-medium">
                            <bdi>{contactName}</bdi>
                          </span>
                          <span className="text-[13px] leading-[18px] text-muted-foreground">
                            {[
                              labelOf(contact.relation),
                              contact.phone ?? m.commonNotRecorded(),
                            ]
                              .filter(Boolean)
                              .map((part, index) => (
                                <span key={part}>
                                  {index > 0 ? " · " : null}
                                  <bdi dir={index > 0 ? "ltr" : undefined}>
                                    {part}
                                  </bdi>
                                </span>
                              ))}
                          </span>
                          {waiting(
                            (change) =>
                              change.relationshipId === contact.relationshipId,
                          ) ? (
                            <StatusText tone="warning">
                              {m.medicalChangeWaiting()}
                            </StatusText>
                          ) : null}
                        </div>
                        <ActionMenu
                          label={m.medicalActions({ record: contactName })}
                          actions={[
                            {
                              label: m.medicalAskPhoneChange(),
                              icon: Pencil,
                              onSelect: () =>
                                ask({
                                  target: "contact",
                                  contact: {
                                    relationshipId: contact.relationshipId,
                                    name: contactName,
                                    phone: contact.phone,
                                  },
                                }),
                            },
                          ]}
                        />
                      </li>
                    );
                  })}
                </RecordList>
              )}
            </RecordSection>
          </>
        }
        aside={
          <RecordSection
            title={m.medicalYourChanges()}
            description={m.medicalYourChangesHint()}
          >
            {summary.changes.length === 0 ? (
              <RecordEmpty>{m.medicalNoChanges()}</RecordEmpty>
            ) : (
              <RecordList>
                {summary.changes.map((change) => {
                  const state = CHANGE_STATE[change.state];
                  return (
                    <li key={change.id} className="grid gap-0.5 py-3">
                      <span className="text-[13px] leading-[18px] text-muted-foreground">
                        {change.kind
                          ? KIND_ONE[change.kind]()
                          : m.medicalContactOne()}
                        {" · "}
                        {m.medicalAskedOn({
                          date: formatDate(change.askedOn),
                        })}
                      </span>
                      <span className="text-sm leading-5 font-medium">
                        <bdi dir={"phone" in change.after ? "ltr" : undefined}>
                          {valueLine(change.after)}
                        </bdi>
                      </span>
                      <StatusText tone={state.tone}>{state.label()}</StatusText>
                      {change.report ? (
                        <div className="mt-1">
                          <FileList
                            files={[
                              {
                                id: change.report.fileId,
                                name: change.report.name,
                                mediaType: change.report.mediaType,
                                sizeBytes: change.report.sizeBytes,
                              },
                            ]}
                          />
                        </div>
                      ) : null}
                      {change.reason ? (
                        <span className="text-sm leading-5">
                          <span className="text-muted-foreground">
                            {m.medicalReason()}{" "}
                          </span>
                          <bdi>{change.reason}</bdi>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </RecordList>
            )}
          </RecordSection>
        }
      />
      {asking.value ? (
        <ChangeSheet
          key={asking.key}
          studentId={studentId}
          name={name}
          asking={asking.value}
          onClose={() => setAsking((current) => ({ ...current, value: null }))}
        />
      ) : null}
    </>
  );
}

function ChildHealth({ studentId, name }: { studentId: string; name: string }) {
  const summary = useSuspenseQuery(familyHealthQuery(studentId)).data;
  return (
    <>
      <PageHeader
        title={m.medicalTitle({ name })}
        description={summary.permitted ? m.medicalHint({ name }) : undefined}
      />
      {summary.permitted ? (
        <Summary studentId={studentId} name={name} summary={summary} />
      ) : (
        <EmptyState
          icon={HeartPulse}
          title={m.medicalNotShared()}
          description={m.medicalNotSharedBody({ name })}
        />
      )}
    </>
  );
}

function FamilyHealthPage() {
  const search = Route.useSearch();
  const user = useCurrentUser();
  const children = useSuspenseQuery(personRecordQuery(user.id)).data.children;
  const child =
    children.find((entry) => entry.studentId === search.studentId) ??
    (search.studentId ? null : children[0]);
  if (!child)
    return (
      <>
        <PageHeader title={m.medicalTitleShort()} />
        <EmptyState
          icon={Users}
          title={m.courseworkNoChildren()}
          description={m.courseworkNoChildrenBody()}
        />
      </>
    );
  return (
    <ChildHealth
      key={child.studentId}
      studentId={child.studentId}
      name={displayName(child)}
    />
  );
}
