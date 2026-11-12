import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import * as v from "valibot";

import { StudentModuleList } from "~/components/learning/StudentModules";
import { displayName } from "~/components/people/format";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { childrenQuery } from "~/queries/families";
import { myModulesQuery } from "~/queries/learning";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/family/modules")({
  validateSearch: v.object({
    studentId: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    const children = await context.queryClient.ensureQueryData(
      childrenQuery(user.id),
    );
    const child = deps.studentId ?? children[0]?.studentId;
    if (child) await context.queryClient.ensureQueryData(myModulesQuery(child));
  },
  component: FamilyModulesPage,
});

function FamilyModulesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const children = useSuspenseQuery(childrenQuery(user.id)).data;
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
    <Page width="list">
      <PageHeader title={m.navModules()} description={m.lrnFamilyHint()} />
      {current ? (
        <div className="grid gap-6">
          {children.length > 1 ? <IndexToolbar facets={[childFacet]} /> : null}
          <StudentModuleList studentId={current} />
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title={m.courseworkNoChildren()}
          description={m.courseworkNoChildrenBody()}
        />
      )}
    </Page>
  );
}
