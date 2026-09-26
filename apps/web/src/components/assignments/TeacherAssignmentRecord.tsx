import type { LearnerState } from "@faridalms/domain/assignment";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck, Pencil } from "lucide-react";
import { Suspense } from "react";

import type { DataColumn } from "~/components/admin/DataTable";
import type { getAssignmentWorkspace } from "~/server/assignments";

import { DataTable } from "~/components/admin/DataTable";
import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { TableFilter } from "~/components/admin/TableFilter";
import { ButtonLink } from "~/components/app/ButtonLink";
import { ASSIGNMENT_TYPE_LABEL } from "~/components/app/labels";
import {
  Field,
  FieldGrid,
  PageHeader,
  SectionCard,
  Value,
} from "~/components/app/primitives";
import { ContentView } from "~/components/content/ContentView";
import { PersonLink } from "~/components/records/PersonLink";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  assignmentWorkspaceQuery,
  attemptReviewQuery,
} from "~/queries/assignments";
import { formatNumber } from "~/utils/datetime";

import { AssessmentForm } from "./AssessmentForm";
import { AttemptView } from "./AttemptView";
import { FileList } from "./FileList";
import { formatInstant } from "./format";
import {
  AssignmentStatusBadge,
  LATE_POLICY_LABEL,
  LEARNER_STATE_LABEL,
  LearnerStateBadge,
  RESUBMISSION_LABEL,
  SUBMISSION_FORMAT_LABEL,
  WindowBadge,
} from "./labels";
import { RecordContext } from "./RecordContext";

export const TEACHER_TABS = ["overview", "learners", "review"] as const;
export type TeacherTab = (typeof TEACHER_TABS)[number];
export interface TeacherRecordSearch {
  tab: TeacherTab;
  attempt: string;
  q: string;
  state: "all" | LearnerState;
  page: number;
}
type Workspace = Awaited<ReturnType<typeof getAssignmentWorkspace>>;
type Learner = Workspace["learners"][number] & { id: string; timeZone: string };

const columns: DataColumn<Learner, "name">[] = [
  {
    id: "name",
    label: m.teachStudent,
    sort: "name",
    render: (row) => (
      <Link
        to="/students/$studentId"
        params={{ studentId: row.student.id }}
        search={{}}
        className="flex items-center gap-3 font-medium hover:text-primary hover:underline"
      >
        <PersonAvatar
          name={`${row.student.firstName} ${row.student.lastName}`}
          photoUrl={row.student.photoUrl}
        />
        {row.student.firstName} {row.student.lastName}
      </Link>
    ),
  },
  {
    id: "state",
    label: m.courseworkStatus,
    render: (row) => (
      <LearnerStateBadge
        state={row.state}
        late={row.latestAttempt?.isLate ?? false}
      />
    ),
  },
  {
    id: "attempt",
    label: m.attemptLatest,
    render: (row) => (
      <Value>
        {row.latestAttempt
          ? m.attemptNumberedOn({
              number: formatNumber(row.latestAttempt.number),
              date:
                formatInstant(row.latestAttempt.submittedAt, row.timeZone) ??
                "",
            })
          : null}
      </Value>
    ),
  },
  {
    id: "score",
    label: m.assignmentsScore,
    render: (row) => (
      <Value>
        {row.latestAttempt?.released && row.latestAttempt.score !== null
          ? formatNumber(row.latestAttempt.score)
          : null}
      </Value>
    ),
  },
];

function Review({
  attemptId,
  canAssess,
  timeZone,
  onSelectAttempt,
}: {
  attemptId: string;
  canAssess: boolean;
  timeZone: string;
  onSelectAttempt: (id: string) => void;
}) {
  const { data } = useSuspenseQuery(attemptReviewQuery(attemptId));
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <SectionCard
        title={m.attemptNumbered({ number: formatNumber(data.number) })}
        description={`${data.student.firstName} ${data.student.lastName} · ${formatInstant(data.submittedAt, timeZone) ?? ""}${data.isLate ? ` · ${m.assignmentWindowLate()}` : ""}`}
        actions={
          data.history.length > 1 ? (
            <fieldset className="flex flex-wrap gap-1">
              <legend className="sr-only">{m.attemptHistory()}</legend>
              {data.history.map((row) => (
                <Button
                  key={row.id}
                  type="button"
                  size="sm"
                  variant={row.id === data.id ? "secondary" : "ghost"}
                  aria-pressed={row.id === data.id}
                  onClick={() => onSelectAttempt(row.id)}
                >
                  {formatNumber(row.number)}
                </Button>
              ))}
            </fieldset>
          ) : undefined
        }
      >
        <AttemptView
          content={data.content}
          plainText={data.plainText}
          files={data.files}
        />
      </SectionCard>
      <SectionCard
        title={m.assessmentTitle()}
        description={data.isCurrent ? undefined : m.assessmentEarlierAttempt()}
      >
        {canAssess ? (
          <AssessmentForm key={data.id} review={data} timeZone={timeZone} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {m.courseworkAssessmentRestricted()}
          </p>
        )}
      </SectionCard>
    </div>
  );
}

/** The assessor's record page: the brief, every learner's state, and review. */
export function TeacherAssignmentRecord({
  id,
  search,
  onSearch,
}: {
  id: string;
  search: TeacherRecordSearch;
  onSearch: (change: Partial<TeacherRecordSearch>) => void;
}) {
  const { data } = useSuspenseQuery(assignmentWorkspaceQuery(id));
  const user = useCurrentUser();
  const timeZone = data.timeZone;
  const learners = data.learners
    .filter(
      (row) =>
        (search.state === "all" || row.state === search.state) &&
        `${row.student.firstName} ${row.student.lastName}`
          .toLocaleLowerCase()
          .includes(search.q.toLocaleLowerCase()),
    )
    .map((row) => ({ ...row, id: row.student.id, timeZone }));
  const pages = Math.max(1, Math.ceil(learners.length / 25));
  const page = Math.min(search.page, pages);
  const counts = {
    submitted: data.learners.filter((row) => row.state === "submitted").length,
    returned: data.learners.filter((row) => row.state === "returned").length,
  };
  return (
    <>
      <PageHeader
        title={data.title}
        actions={
          <>
            <AssignmentStatusBadge status={data.status} />
            {data.status === "published" ? (
              <WindowBadge window={data.window} />
            ) : null}
            {data.canAuthor && user.workspace === "teach" ? (
              <ButtonLink
                to="/teach/assignment-editor"
                search={{ id: data.id }}
              >
                <Pencil className="size-4" aria-hidden />
                {m.assignmentEditTitle()}
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <RecordContext subject={data.subject} schoolClass={data.class} />
      <Tabs
        value={search.tab}
        onValueChange={(tab) => {
          const match = TEACHER_TABS.find((item) => item === tab);
          if (match) onSearch({ tab: match });
        }}
        className="gap-6"
      >
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="overview">{m.recordOverview()}</TabsTrigger>
          <TabsTrigger value="learners">
            {m.assignmentLearnersTab({
              count: formatNumber(data.learners.length),
            })}
          </TabsTrigger>
          <TabsTrigger value="review">{m.courseworkReview()}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
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
            <div className="space-y-6">
              <SectionCard title={m.assignmentSchedule()}>
                <FieldGrid>
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
                  <Field
                    label={m.assignmentsWeek({
                      number: data.week?.number ?? 0,
                    })}
                  >
                    {data.week
                      ? `${data.week.startsOn} – ${data.week.endsOn}`
                      : null}
                  </Field>
                </FieldGrid>
              </SectionCard>
              <SectionCard title={m.assignmentSettings()}>
                <FieldGrid>
                  <Field label={m.assignmentsType()}>
                    {ASSIGNMENT_TYPE_LABEL[data.type]()}
                  </Field>
                  <Field label={m.assignmentSubmissionFormat()}>
                    {SUBMISSION_FORMAT_LABEL[data.submissionFormat]()}
                  </Field>
                  <Field label={m.assignmentMaxAttachments()}>
                    {data.submissionFormat === "written"
                      ? null
                      : formatNumber(data.maxAttachments)}
                  </Field>
                  <Field label={m.courseworkMaxScore()}>
                    {formatNumber(data.maxScore)}
                  </Field>
                  <Field label={m.assignmentsTeacher()}>
                    {data.author ? <PersonLink person={data.author} /> : null}
                  </Field>
                  <Field label={m.assignmentPublishedAt()}>
                    {formatInstant(data.publishedAt, timeZone)}
                  </Field>
                </FieldGrid>
              </SectionCard>
              {data.rubric.length ? (
                <SectionCard title={m.rubricTitle()}>
                  <ul className="divide-y">
                    {data.rubric.map((criterion) => (
                      <li
                        key={criterion.id}
                        className="flex items-start justify-between gap-4 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {criterion.title}
                          </p>
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
                </SectionCard>
              ) : null}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="learners">
          <p className="mb-4 text-sm text-muted-foreground">
            {m.assignmentProgress({
              submitted: formatNumber(counts.submitted + counts.returned),
              returned: formatNumber(counts.returned),
              total: formatNumber(data.learners.length),
            })}
          </p>
          <DataTable
            rows={learners.slice((page - 1) * 25, page * 25)}
            columns={columns}
            caption={m.assignmentLearnersTab({
              count: formatNumber(data.learners.length),
            })}
            query={search.q}
            onQuery={(q) => onSearch({ q, page: 1 })}
            sort="name"
            direction="asc"
            onSort={() => undefined}
            page={page}
            pages={pages}
            total={learners.length}
            onPage={(next) => onSearch({ page: next })}
            filters={
              <TableFilter
                label={m.courseworkStatus()}
                value={search.state}
                classes={[
                  { id: "all", name: m.courseworkAll() },
                  ...(Object.keys(LEARNER_STATE_LABEL) as LearnerState[]).map(
                    (state) => ({
                      id: state,
                      name: LEARNER_STATE_LABEL[state](),
                    }),
                  ),
                ]}
                onChange={(value) => {
                  const state = (
                    [
                      "all",
                      ...Object.keys(LEARNER_STATE_LABEL),
                    ] as TeacherRecordSearch["state"][]
                  ).find((item) => item === value);
                  if (state) onSearch({ state, page: 1 });
                }}
              />
            }
            renderActions={(row) =>
              row.latestAttempt ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onSearch({
                      tab: "review",
                      attempt: row.latestAttempt?.id ?? "",
                    })
                  }
                  aria-label={m.attemptReviewFor({
                    name: `${row.student.firstName} ${row.student.lastName}`,
                  })}
                >
                  <ClipboardCheck className="size-4" aria-hidden />
                  {m.courseworkReview()}
                </Button>
              ) : null
            }
          />
        </TabsContent>
        <TabsContent value="review">
          {search.attempt ? (
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <Review
                attemptId={search.attempt}
                canAssess={data.canAssess}
                timeZone={timeZone}
                onSelectAttempt={(attempt) => onSearch({ attempt })}
              />
            </Suspense>
          ) : (
            <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              {m.attemptPickOne()}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
