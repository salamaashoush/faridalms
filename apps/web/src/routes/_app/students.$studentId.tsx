import { createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

import {
  STUDENT_TABS,
  StudentRecord,
  studentTabsFor,
} from "~/components/people/StudentRecord";
import * as m from "~/i18n/messages";
import {
  peopleOptionsQuery,
  studentHistoryQuery,
  studentRecordQuery,
} from "~/queries/students";

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
  }),
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ context, params, deps }) => {
    const { queryClient } = context;
    const [record] = await Promise.all([
      queryClient.ensureQueryData(studentRecordQuery(params.studentId)),
      queryClient.ensureQueryData(peopleOptionsQuery),
    ]);
    // A tab this viewer cannot open would show the overview under a URL that
    // still names the tab, and a shared link would keep naming it.
    if (!studentTabsFor(record.access)[deps.tab])
      throw redirect({
        to: "/students/$studentId",
        params: { studentId: params.studentId },
        search: { tab: "overview" as const },
        replace: true,
      });
    if (deps.tab === "history")
      await queryClient.ensureQueryData(studentHistoryQuery(params.studentId));
  },
  component: StudentPage,
});

function StudentPage() {
  const { studentId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <StudentRecord
      studentId={studentId}
      tab={tab}
      onTab={(nextTab) => {
        void navigate({
          search: (previous) => ({ ...previous, tab: nextTab }),
        });
      }}
    />
  );
}
