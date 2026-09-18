import { createFileRoute } from "@tanstack/react-router";

import {
  CourseworkWorkspace,
  courseworkSearchSchema,
} from "~/components/me/CourseworkWorkspace";
import { assignmentsQuery, visibleStudentsQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/family/assignments")({
  validateSearch: courseworkSearchSchema,
  loaderDeps: ({ search }) => ({
    studentId: search.studentId,
    week: search.week,
  }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(assignmentsQuery(deps)),
      context.queryClient.ensureQueryData(visibleStudentsQuery),
    ]);
  },
  component: Page,
});
function Page() {
  return <CourseworkWorkspace search={Route.useSearch()} family={true} />;
}
