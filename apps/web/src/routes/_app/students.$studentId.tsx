import { createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

import { MESSAGES } from "~/components/notifications/format";
import { studentRecordTabs } from "~/components/people/slots";
import {
  StudentRecord,
  studentTabOpens,
} from "~/components/people/StudentRecord";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  peopleOptionsQuery,
  studentHistoryQuery,
  studentRecordQuery,
} from "~/queries/students";
import { currentUserQuery } from "~/queries/user";
import { filled } from "~/utils/extension";

export const Route = createFileRoute("/_app/students/$studentId")({
  staticData: {
    breadcrumb: m.studentRecordBreadcrumb,
    section: "/students",
  },
  validateSearch: v.object({
    // Old links named tabs that no longer exist; they open the overview.
    tab: v.fallback(
      v.optional(v.pipe(v.string(), v.regex(/^[a-z]{1,20}$/)), "overview"),
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
    const user = await queryClient.ensureQueryData(currentUserQuery);
    const added = filled(context.extensions, user.modules, studentRecordTabs);
    if (
      !studentTabOpens(record.access, deps.tab, added) &&
      !(deps.tab === "family" && record.access.contacts)
    )
      throw redirect({
        to: "/students/$studentId",
        params: { studentId: params.studentId },
        search: { tab: "overview" },
        replace: true,
      });
    if (deps.tab === "history")
      await queryClient.ensureInfiniteQueryData(
        studentHistoryQuery(params.studentId),
      );
  },
  component: StudentPage,
});

function StudentPage() {
  const { studentId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { workspace } = useCurrentUser();
  return (
    <StudentRecord
      studentId={studentId}
      tab={tab}
      onConversation={(thread) =>
        void navigate({ to: MESSAGES[workspace], search: { thread } })
      }
      onTab={(nextTab) => {
        void navigate({
          resetScroll: false,
          replace: true,
          search: (previous) => ({ ...previous, tab: nextTab }),
        });
      }}
    />
  );
}
