import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import {
  STUDENT_TABS,
  StudentProfile,
} from "~/components/records/StudentProfile";
import {
  assignmentsQuery,
  attendanceQuery,
  gradesQuery,
  studentQuery,
} from "~/queries/school";

export const Route = createFileRoute("/_app/students/$studentId")({
  validateSearch: v.object({
    tab: v.optional(v.picklist(STUDENT_TABS), "information"),
    week: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  }),
  loaderDeps: ({ search }) => ({ tab: search.tab, week: search.week }),
  loader: async ({ context, params, deps }) => {
    const { access } = await context.queryClient.ensureQueryData(
      studentQuery({ studentId: params.studentId }),
    );
    const scoped = { studentId: params.studentId };
    if (deps.tab === "coursework" && access.coursework)
      await context.queryClient.ensureQueryData(
        assignmentsQuery({ ...scoped, week: deps.week }),
      );
    if (deps.tab === "attendance" && access.attendance)
      await context.queryClient.ensureQueryData(attendanceQuery(scoped));
    if (deps.tab === "grades" && access.grades)
      await context.queryClient.ensureQueryData(gradesQuery(scoped));
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
        });
      }}
    />
  );
}
