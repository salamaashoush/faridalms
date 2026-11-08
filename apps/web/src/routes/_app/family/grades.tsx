import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import * as v from "valibot";

import { StudentGrades } from "~/components/coursework/StudentGrades";
import { displayName } from "~/components/people/format";
import { GoalsReport } from "~/components/standards/Goals";
import { SkillsSection } from "~/components/standards/Progress";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { studentGradesQuery } from "~/queries/gradebook";
import { goalsReportQuery, studentProgressQuery } from "~/queries/standards";
import { personRecordQuery } from "~/queries/students";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/family/grades")({
  validateSearch: v.object({
    studentId: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    const me = await context.queryClient.ensureQueryData(
      personRecordQuery(user.id),
    );
    const child = deps.studentId ?? me.children[0]?.studentId;
    if (child)
      await Promise.all([
        context.queryClient.ensureQueryData(studentGradesQuery(child)),
        user.modules.standards
          ? context.queryClient.ensureQueryData(studentProgressQuery(child))
          : null,
        user.modules.standards
          ? context.queryClient.ensureQueryData(goalsReportQuery(child))
          : null,
      ]);
  },
  component: FamilyGradesPage,
});

function FamilyGradesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const children = useSuspenseQuery(personRecordQuery(user.id)).data.children;
  const current = search.studentId ?? children[0]?.studentId;
  const childFacet: Facet = {
    id: "child",
    label: m.courseworkChild(),
    single: true,
    options: children.map((child) => ({
      value: child.studentId,
      label: displayName(child),
    })),
    selected: current ? [current] : [],
    defaultSelected: children[0] ? [children[0].studentId] : [],
    onChange: ([next]) => {
      void navigate({ search: { studentId: next || undefined } });
    },
  };
  return (
    <>
      <PageHeader title={m.gradesTitle()} description={m.gradesFamilyHint()} />
      {current ? (
        <div className="grid gap-6">
          {children.length > 1 ? <IndexToolbar facets={[childFacet]} /> : null}
          <div className="grid gap-10">
            {user.modules.standards ? (
              <GoalsReport studentId={current} />
            ) : null}
            <StudentGrades studentId={current} />
            {user.modules.standards ? (
              <SkillsSection studentId={current} />
            ) : null}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title={m.courseworkNoChildren()}
          description={m.courseworkNoChildrenBody()}
        />
      )}
    </>
  );
}
