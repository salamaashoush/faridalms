import { useSuspenseQuery } from "@tanstack/react-query";

import { ASSIGNMENT_TYPE_LABEL } from "~/components/app/labels";
import {
  Field,
  FieldGrid,
  PageHeader,
  SectionCard,
  Value,
} from "~/components/app/primitives";
import { ContentView } from "~/components/content/ContentView";
import { StudentScopeBar } from "~/components/family/StudentScopeBar";
import { PersonLink } from "~/components/records/PersonLink";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import * as m from "~/i18n/messages";
import { learnerAssignmentQuery } from "~/queries/assignments";
import { formatNumber } from "~/utils/datetime";

import { AttemptHistory } from "./AttemptHistory";
import { FileList } from "./FileList";
import { formatInstant } from "./format";
import {
  LATE_POLICY_LABEL,
  LearnerStateBadge,
  RESUBMISSION_LABEL,
  SUBMISSION_FORMAT_LABEL,
  WindowBadge,
} from "./labels";
import { RecordContext } from "./RecordContext";
import { SubmissionEditor } from "./SubmissionEditor";

export const LEARNER_TABS = ["brief", "work"] as const;
export type LearnerTab = (typeof LEARNER_TABS)[number];

/** The learner's and the family's record page. The family reads; the learner also writes. */
export function LearnerAssignmentRecord({
  id,
  studentId,
  tab,
  family,
  onTab,
  onStudent,
}: {
  id: string;
  studentId: string;
  tab: LearnerTab;
  family: boolean;
  onTab: (tab: LearnerTab) => void;
  onStudent: (studentId: string) => void;
}) {
  const { data } = useSuspenseQuery(learnerAssignmentQuery(id, studentId));
  const timeZone = data.timeZone;
  const latest = data.submission.attempts.at(-1);
  const stateHint = {
    scheduled: m.learnerHintScheduled({
      date: formatInstant(data.availableFrom, timeZone) ?? "",
    }),
    not_started:
      data.window === "late"
        ? m.learnerHintLate()
        : m.learnerHintOpen({
            date: formatInstant(data.dueAt, timeZone) ?? "",
          }),
    draft: m.learnerHintDraft(),
    submitted: m.learnerHintSubmitted(),
    returned: data.canEdit
      ? m.learnerHintReturnedResubmit()
      : m.learnerHintReturned(),
    missing: m.learnerHintMissing({
      date: formatInstant(data.closesAt ?? data.dueAt, timeZone) ?? "",
    }),
  }[data.state];
  return (
    <>
      <PageHeader
        title={data.title}
        actions={
          <>
            <LearnerStateBadge
              state={data.state}
              late={latest?.isLate ?? false}
            />
            <WindowBadge window={data.window} />
          </>
        }
      />
      <RecordContext subject={data.subject} schoolClass={data.class} />
      {family ? (
        <StudentScopeBar studentId={data.studentId} onChange={onStudent} />
      ) : null}
      <p className="mb-6 rounded-xl border bg-card px-4 py-3 text-sm">
        {stateHint}
      </p>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const match = LEARNER_TABS.find((item) => item === value);
          if (match) onTab(match);
        }}
        className="gap-6"
      >
        <TabsList>
          <TabsTrigger value="brief">{m.assignmentBrief()}</TabsTrigger>
          <TabsTrigger value="work">
            {family ? m.assignmentChildWork() : m.assignmentYourWork()}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="brief">
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-6">
              <SectionCard title={m.courseworkInstructions()}>
                {data.instructions ? (
                  <ContentView document={data.instructions} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">
                    <Value>{data.description}</Value>
                  </p>
                )}
              </SectionCard>
              <SectionCard title={m.assignmentResources()}>
                <FileList
                  files={data.resources}
                  emptyLabel={m.assignmentNoResources()}
                />
              </SectionCard>
            </div>
            <SectionCard title={m.assignmentSchedule()}>
              <FieldGrid>
                <Field label={m.assignmentsType()}>
                  {ASSIGNMENT_TYPE_LABEL[data.type]()}
                </Field>
                <Field label={m.assignmentsTeacher()}>
                  {data.author ? <PersonLink person={data.author} /> : null}
                </Field>
                <Field label={m.assignmentAvailableFrom()}>
                  {formatInstant(data.availableFrom, timeZone)}
                </Field>
                <Field label={m.assignmentDueAt()}>
                  {formatInstant(data.dueAt, timeZone)}
                </Field>
                <Field label={m.assignmentClosesAt()}>
                  {formatInstant(data.closesAt, timeZone)}
                </Field>
                <Field label={m.assignmentLatePolicy()}>
                  {LATE_POLICY_LABEL[data.latePolicy]()}
                  {data.latePolicy === "accepted_with_deduction"
                    ? ` (${formatNumber(data.lateDeductionPercent)}%)`
                    : ""}
                </Field>
                <Field label={m.assignmentResubmission()}>
                  {RESUBMISSION_LABEL[data.resubmission]()}
                </Field>
                <Field label={m.assignmentSubmissionFormat()}>
                  {SUBMISSION_FORMAT_LABEL[data.submissionFormat]()}
                </Field>
                <Field label={m.courseworkMaxScore()}>
                  {formatNumber(data.maxScore)}
                </Field>
              </FieldGrid>
              {data.rubric.length ? (
                <ul className="mt-5 divide-y border-t">
                  {data.rubric.map((criterion) => (
                    <li
                      key={criterion.id}
                      className="flex items-start justify-between gap-4 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{criterion.title}</p>
                        {criterion.description ? (
                          <p className="text-xs text-muted-foreground">
                            {criterion.description}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-sm whitespace-nowrap text-muted-foreground">
                        {m.teachOutOf({ max: criterion.maxPoints })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </SectionCard>
          </div>
        </TabsContent>
        <TabsContent value="work">
          <div className="space-y-6">
            {data.canEdit ? (
              <SectionCard
                title={
                  data.submission.attempts.length
                    ? m.submissionNewAttempt()
                    : m.assignmentYourWork()
                }
                description={
                  data.submissionFormat === "written"
                    ? m.submissionFormatWrittenHint()
                    : data.submissionFormat === "files"
                      ? m.submissionFormatFilesHint({
                          count: formatNumber(data.maxAttachments),
                        })
                      : m.submissionFormatBothHint({
                          count: formatNumber(data.maxAttachments),
                        })
                }
              >
                <SubmissionEditor
                  key={data.submission.revision}
                  assignment={data}
                />
              </SectionCard>
            ) : null}
            <AttemptHistory assignment={data} />
            {!data.canEdit && data.submission.attempts.length === 0 ? (
              <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                {family
                  ? m.assignmentNoWorkYetChild()
                  : m.assignmentNoWorkYet()}
              </p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
