import type { SummaryKind } from "@faridalms/domain/people";

import { SUMMARY_KINDS } from "@faridalms/domain/people";
import { Button } from "@faridalms/ui/button";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import {
  RecordColumns,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { HeartPulse, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { displayName, labelOf } from "~/components/people/format";
import { FileList } from "~/components/system/FileList";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { summaryQuery } from "~/queries/records";
import { formatDate } from "~/utils/datetime";

import type { Asking } from "./ChangeSheet";

import { ChangeSheet } from "./ChangeSheet";
import {
  CHANGE_STATE,
  KIND_EMPTY,
  KIND_ONE,
  KIND_SECTION,
  SEVERITY_LABEL,
  valueLine,
} from "./labels";

type Summary = Extract<
  Awaited<ReturnType<NonNullable<ReturnType<typeof summaryQuery>["queryFn"]>>>,
  { permitted: true }
>;

interface SummaryProps {
  studentId: string;
  name: string;
  summary: Summary;
}

function Summary({ studentId, name, summary }: SummaryProps) {
  const [asking, setAsking] = useState<{ key: number; value: Asking | null }>({
    key: 0,
    value: null,
  });
  const ask = (value: Asking) =>
    setAsking((current) => ({ key: current.key + 1, value }));
  const waiting = (match: (change: Summary["changes"][number]) => boolean) =>
    summary.changes.some((change) => change.state === "open" && match(change));
  const section = (kind: SummaryKind) => {
    const records = summary.records.filter((record) => record.kind === kind);
    const single = kind === "doctor" && records.length > 0;
    return (
      <RecordSection
        key={kind}
        title={KIND_SECTION[kind]()}
        action={
          single || !summary.asks ? undefined : (
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
                {summary.asks ? (
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
                ) : null}
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
            {SUMMARY_KINDS.map(section)}
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
                        key={contact.id}
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
                            (change) => change.contactId === contact.id,
                          ) ? (
                            <StatusText tone="warning">
                              {m.medicalChangeWaiting()}
                            </StatusText>
                          ) : null}
                        </div>
                        {summary.asks && contact.askable ? (
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
                                      contactId: contact.id,
                                      name: contactName,
                                      phone: contact.phone,
                                    },
                                  }),
                              },
                            ]}
                          />
                        ) : null}
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

export interface LearnerHealthProps {
  studentId: string;
  name: string;
}

/**
 * A learner's medical summary as the learner or a guardian permitted to
 * read it sees it, with the changes they asked the school for; a reader who
 * decides for the learner asks for changes from it.
 */
export function LearnerHealth({ studentId, name }: LearnerHealthProps) {
  const summary = useSuspenseQuery(summaryQuery(studentId)).data;
  const self = studentId === useCurrentUser().id;
  return (
    <Page width="record">
      <PageHeader
        title={self ? m.myMedicalTitle() : m.medicalTitle({ name })}
        description={
          summary.permitted
            ? self
              ? m.myMedicalHint()
              : m.medicalHint({ name })
            : undefined
        }
      />
      {summary.permitted ? (
        <Summary studentId={studentId} name={name} summary={summary} />
      ) : (
        <EmptyState
          icon={HeartPulse}
          title={m.medicalNotShared()}
          description={
            self ? m.myMedicalNotSharedBody() : m.medicalNotSharedBody({ name })
          }
        />
      )}
    </Page>
  );
}
