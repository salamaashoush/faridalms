import { createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

import {
  STUDENT_TABS,
  StudentProfile,
  studentTabsFor,
  todaySource,
} from "~/components/records/StudentProfile";
import * as m from "~/i18n/messages";
import {
  assignmentsQuery,
  attendanceQuery,
  classQuery,
  gradesQuery,
  studentManagementQuery,
  studentQuery,
  timetableQuery,
} from "~/queries/school";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/students/$studentId")({
  staticData: {
    breadcrumb: m.studentRecordBreadcrumb,
    section: "/admin/students",
  },
  validateSearch: v.object({
    // Old links named tabs that no longer exist; they open the overview.
    tab: v.fallback(
      v.optional(v.picklist(STUDENT_TABS), "overview"),
      "overview",
    ),
    week: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  }),
  loaderDeps: ({ search }) => ({ tab: search.tab, week: search.week }),
  loader: async ({ context, params, deps }) => {
    const { queryClient } = context;
    const [{ access, profile }, user] = await Promise.all([
      queryClient.ensureQueryData(
        studentQuery({ studentId: params.studentId }),
      ),
      queryClient.ensureQueryData(currentUserQuery),
    ]);
    // A tab this viewer cannot open would show the overview under a URL that
    // still names the tab, and a shared link would keep naming it.
    if (!studentTabsFor(access)[deps.tab])
      throw redirect({
        to: "/students/$studentId",
        params: { studentId: params.studentId },
        search: (previous) => ({ ...previous, tab: "overview" as const }),
        replace: true,
      });
    const scoped = { studentId: params.studentId };
    const overview = deps.tab === "overview";
    const pending: Promise<unknown>[] = [];
    if (access.attendance && (overview || deps.tab === "attendance"))
      pending.push(queryClient.ensureQueryData(attendanceQuery(scoped)));
    if (access.grades && (overview || deps.tab === "coursework"))
      pending.push(queryClient.ensureQueryData(gradesQuery(scoped)));
    if (access.coursework && deps.tab === "coursework")
      pending.push(
        queryClient.ensureQueryData(
          assignmentsQuery({ ...scoped, week: deps.week }),
        ),
      );
    const lessons = overview ? todaySource(user, profile) : null;
    if (lessons === "student")
      pending.push(queryClient.ensureQueryData(timetableQuery(scoped)));
    else if (typeof lessons === "object" && lessons)
      pending.push(queryClient.ensureQueryData(classQuery(lessons.classId)));
    if (access.manage)
      pending.push(
        queryClient.ensureQueryData(studentManagementQuery(params.studentId)),
      );
    await Promise.all(pending);
  },
  component: StudentPage,
});

function StudentPage() {
  const { studentId } = Route.useParams();
  const { tab, week } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <StudentProfile
      studentId={studentId}
      tab={tab}
      week={week}
      onTab={(nextTab) => {
        void navigate({
          search: (previous) => ({ ...previous, tab: nextTab }),
        });
      }}
      onWeek={(nextWeek) => {
        void navigate({
          search: (previous) => ({ ...previous, week: nextWeek }),
          replace: true,
        });
      }}
    />
  );
}
