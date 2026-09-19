import { DEFAULT_ATTENDANCE_REGISTER_QUERY } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, Pencil, UserCheck } from "lucide-react";
import { Suspense } from "react";
import * as v from "valibot";

import type { getClass } from "~/server/school";

import { DataTable } from "~/components/admin/DataTable";
import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { YEAR_STATUS_LABEL } from "~/components/admin/YearLifecycle";
import { ButtonLink } from "~/components/app/ButtonLink";
import { SubjectIcon } from "~/components/app/labels";
import {
  EmptyState,
  Field,
  FieldGrid,
  PageHeader,
  SectionCard,
  Value,
} from "~/components/app/primitives";
import { AssignmentStatusBadge } from "~/components/assignments/labels";
import { formatDate, subjectLabel } from "~/components/family/format";
import { TimetableGrid } from "~/components/family/TimetableGrid";
import { WeekNav } from "~/components/family/WeekNav";
import { PersonLink } from "~/components/records/PersonLink";
import { HandedIn } from "~/components/teach/HandedIn";
import { Card, CardContent } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import * as m from "~/i18n/messages";
import { classAssignmentsQuery, classQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

const TABS = [
  "overview",
  "students",
  "coursework",
  "attendance",
  "timetable",
] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: string): value is Tab =>
  TABS.some((tab) => tab === value);

export const Route = createFileRoute("/_app/classes/$classId")({
  validateSearch: v.object({
    tab: v.optional(v.picklist(TABS), "overview"),
    q: v.optional(v.string(), ""),
    page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
    week: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  }),
  loaderDeps: ({ search }) => ({ tab: search.tab, week: search.week }),
  loader: async ({ context, params, deps }) => {
    await context.queryClient.ensureQueryData(classQuery(params.classId));
    if (deps.tab === "coursework")
      await context.queryClient.ensureQueryData(
        classAssignmentsQuery({
          classId: params.classId,
          week: deps.week,
          status: "all",
        }),
      );
  },
  component: ClassPage,
});
type ClassDetail = Awaited<ReturnType<typeof getClass>>;

function ClassPage() {
  const { classId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(classQuery(classId));
  const patch = (change: Partial<typeof search>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  const rows = data.roster
    .filter((row) =>
      `${row.firstName} ${row.lastName} ${row.reference}`
        .toLocaleLowerCase()
        .includes(search.q.toLocaleLowerCase()),
    )
    .toSorted(
      (a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        ) * (search.dir === "asc" ? 1 : -1),
    );
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const page = Math.min(search.page, pages);
  return (
    <>
      <PageHeader
        title={data.name}
        description={
          data.schoolYear
            ? data.schoolYearIsCurrent || !data.schoolYearStatus
              ? data.schoolYear
              : m.classYearContext({
                  year: data.schoolYear,
                  status: YEAR_STATUS_LABEL[data.schoolYearStatus](),
                })
            : undefined
        }
        actions={
          <>
            {data.canRecordAttendance ? (
              <ButtonLink
                variant="outline"
                to="/teach/attendance"
                search={{ ...DEFAULT_ATTENDANCE_REGISTER_QUERY, classId }}
              >
                <UserCheck aria-hidden />
                {m.attendanceRecord()}
              </ButtonLink>
            ) : null}
            {data.canManage ? (
              <ButtonLink to="/admin/class-editor" search={{ id: data.id }}>
                <Pencil aria-hidden />
                {m.managementEditClass()}
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <Tabs
        value={search.tab}
        onValueChange={(tab) => {
          if (isTab(tab)) patch({ tab });
        }}
        className="gap-6"
      >
        <TabsList>
          <TabsTrigger value="overview">{m.recordOverview()}</TabsTrigger>
          <TabsTrigger value="students">{m.adminStudentsTitle()}</TabsTrigger>
          <TabsTrigger value="coursework">{m.navAssignments()}</TabsTrigger>
          {data.attendance ? (
            <TabsTrigger value="attendance">{m.attendanceTitle()}</TabsTrigger>
          ) : null}
          <TabsTrigger value="timetable">{m.navTimetable()}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
            <SectionCard title={m.classDetailsTitle()}>
              <FieldGrid>
                <Field label={m.studentGrade()}>{data.grade}</Field>
                <Field label={m.adminRoom()}>{data.room}</Field>
                <Field label={m.adminHomeroom()}>
                  {data.homeroomTeacher ? (
                    <PersonLink person={data.homeroomTeacher} />
                  ) : null}
                </Field>
                <Field label={m.studentSchoolYear()}>{data.schoolYear}</Field>
              </FieldGrid>
            </SectionCard>
            <SectionCard title={m.recordTeachingTeam()}>
              <ul className="divide-y">
                {data.subjects.map((link) =>
                  link.subject ? (
                    <li
                      key={link.subject.id}
                      className="flex flex-wrap items-center justify-between gap-4 py-3"
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <SubjectIcon icon={link.subject.icon} />
                        {link.subject.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {link.teacher ? (
                          <PersonLink person={link.teacher} />
                        ) : (
                          m.commonNotRecorded()
                        )}
                      </span>
                    </li>
                  ) : null,
                )}
              </ul>
            </SectionCard>
          </div>
        </TabsContent>
        <TabsContent value="students">
          <DataTable
            rows={rows.slice((page - 1) * 25, page * 25)}
            columns={[
              {
                id: "name",
                label: m.adminName,
                sort: "name",
                render: (row) => (
                  <Link
                    to="/students/$studentId"
                    params={{ studentId: row.id }}
                    search={{}}
                    className="flex items-center gap-3 font-medium hover:text-primary hover:underline"
                  >
                    <PersonAvatar
                      name={`${row.firstName} ${row.lastName}`}
                      photoUrl={row.photoUrl}
                    />
                    {row.firstName} {row.lastName}
                  </Link>
                ),
              },
              {
                id: "reference",
                label: m.adminReference,
                render: (row) => row.reference,
              },
            ]}
            caption={m.adminStudentsTitle()}
            query={search.q}
            onQuery={(q) => patch({ q, page: 1 })}
            sort="name"
            direction={search.dir}
            onSort={() => patch({ dir: search.dir === "asc" ? "desc" : "asc" })}
            page={page}
            pages={pages}
            total={rows.length}
            onPage={(nextPage) => patch({ page: nextPage })}
          />
        </TabsContent>
        <TabsContent value="coursework">
          {search.tab === "coursework" ? (
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <ClassCoursework
                classId={classId}
                week={search.week}
                onWeek={(week) => patch({ week })}
              />
            </Suspense>
          ) : null}
        </TabsContent>
        {data.attendance ? (
          <TabsContent value="attendance">
            <ClassAttendance rows={data.attendance} />
          </TabsContent>
        ) : null}
        <TabsContent value="timetable" className="space-y-4">
          {data.canManage ? (
            <div className="flex justify-end">
              <ButtonLink
                variant="outline"
                to="/admin/timetable-editor"
                search={{ classId: data.id }}
              >
                <Pencil aria-hidden />
                {m.timetableEdit()}
              </ButtonLink>
            </div>
          ) : null}
          <Card>
            <CardContent className="px-5">
              <TimetableGrid slots={data.timetable} className={data.name} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function ClassCoursework({
  classId,
  week,
  onWeek,
}: {
  classId: string;
  week: number | undefined;
  onWeek: (week: number) => void;
}) {
  const { data } = useSuspenseQuery(
    classAssignmentsQuery({ classId, week, status: "all" }),
  );
  return (
    <SectionCard
      title={m.navAssignments()}
      description={m.assignmentsWeek({ number: data.week.number })}
      actions={
        <WeekNav week={data.week} weeks={data.weeks} onSelect={onWeek} />
      }
    >
      {data.rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={m.assignmentsEmpty()} />
      ) : (
        <ul className="divide-y">
          {data.rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to="/assignments/$assignmentId"
                  params={{ assignmentId: row.id }}
                  search={{}}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {row.title}
                </Link>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <SubjectIcon icon={row.subject?.icon ?? ""} />
                    <Value>{subjectLabel(row.subject)}</Value>
                  </span>
                  <span aria-hidden>·</span>
                  {m.assignmentsDue({ date: formatDate(row.dueDate) })}
                </p>
              </div>
              <AssignmentStatusBadge status={row.status} />
              {row.status !== "draft" && row.canAssess ? (
                <HandedIn
                  done={row.submittedCount}
                  total={row.recipientCount}
                  className="w-32"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function ClassAttendance({
  rows,
}: {
  rows: NonNullable<ClassDetail["attendance"]>;
}) {
  return (
    <SectionCard
      title={m.recordAttendanceByStudent()}
      description={m.recordAttendanceHint()}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.teachRosterEmpty()}</p>
      ) : (
        <ul className="divide-y">
          {rows.map(({ student, summary }) => (
            <li
              key={student.id}
              className="grid items-center gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
            >
              <Link
                to="/students/$studentId"
                params={{ studentId: student.id }}
                search={{ tab: "attendance" }}
                className="flex items-center gap-3 font-medium hover:text-primary hover:underline"
              >
                <PersonAvatar
                  name={`${student.firstName} ${student.lastName}`}
                  photoUrl={student.photoUrl}
                />
                {student.firstName} {student.lastName}
              </Link>
              {summary?.rate === null || summary === null ? (
                <span className="text-sm text-muted-foreground sm:col-span-2">
                  {m.familyAttendanceEmpty()}
                </span>
              ) : (
                <>
                  <Progress
                    value={summary.rate}
                    aria-label={m.attendanceRate()}
                  />
                  <span className="text-sm tabular-nums">
                    {m.familyPercentValue({
                      value: formatNumber(summary.rate),
                    })}
                    <span className="ms-2 text-xs text-muted-foreground">
                      {m.familyDaysRecorded()}: {formatNumber(summary.total)}
                    </span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
