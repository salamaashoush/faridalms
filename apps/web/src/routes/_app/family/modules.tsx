import { studentScopedQuerySchema } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "~/components/app/primitives";
import { StudentScopeBar } from "~/components/family/StudentScopeBar";
import { ModuleList } from "~/components/learning/ModuleList";
import * as m from "~/i18n/messages";
import { learnerModulesQuery } from "~/queries/learning";
import { visibleStudentsQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/family/modules")({
  validateSearch: studentScopedQuerySchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(learnerModulesQuery(deps.studentId)),
      context.queryClient.ensureQueryData(visibleStudentsQuery),
    ]);
  },
  component: FamilyModulesPage,
});
function FamilyModulesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(learnerModulesQuery(search.studentId));
  return (
    <>
      <PageHeader title={m.navModules()} description={m.learningFamilyHint()} />
      <StudentScopeBar
        studentId={search.studentId}
        onChange={(studentId) => {
          void navigate({ search: (previous) => ({ ...previous, studentId }) });
        }}
      />
      <ModuleList rows={data.rows} studentId={data.studentId} />
    </>
  );
}
