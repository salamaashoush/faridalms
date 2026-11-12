import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import * as v from "valibot";

import { gradesSections } from "~/components/gradebook/slots";
import { displayName } from "~/components/people/format";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { childrenQuery } from "~/queries/families";
import { currentUserQuery } from "~/queries/user";
import { filled } from "~/utils/extension";

export const Route = createFileRoute("/_app/family/grades")({
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
    if (child)
      await Promise.all(
        filled(context.extensions, user.modules, gradesSections).map(
          (section) =>
            context.queryClient.ensureQueryData(section.query(child)),
        ),
      );
  },
  component: FamilyGradesPage,
});

function FamilyGradesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const children = useSuspenseQuery(childrenQuery(user.id)).data;
  const current = search.studentId ?? children[0]?.studentId;
  const sections = useSlot(gradesSections).toSorted(
    (a, b) => a.place - b.place,
  );
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
      <PageHeader title={m.gradesTitle()} description={m.gradesFamilyHint()} />
      {current ? (
        <div className="grid gap-6">
          {children.length > 1 ? <IndexToolbar facets={[childFacet]} /> : null}
          <div className="grid gap-10">
            {sections.map(({ key, Section }) => (
              <Section key={key} studentId={current} />
            ))}
          </div>
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
