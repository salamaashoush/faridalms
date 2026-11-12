import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import * as v from "valibot";

import { LearnerHealth } from "~/components/health/LearnerHealth";
import { displayName } from "~/components/people/format";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { childrenQuery } from "~/queries/families";
import { summaryQuery } from "~/queries/records";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/family/health")({
  staticData: {
    breadcrumb: m.medicalTitleShort,
    section: "/family/children",
  },
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
    if (child) await context.queryClient.ensureQueryData(summaryQuery(child));
  },
  component: FamilyHealthPage,
});

function FamilyHealthPage() {
  const search = Route.useSearch();
  const user = useCurrentUser();
  const children = useSuspenseQuery(childrenQuery(user.id)).data;
  const child =
    children.find((entry) => entry.studentId === search.studentId) ??
    (search.studentId ? null : children[0]);
  if (!child)
    return (
      <Page width="record">
        <PageHeader title={m.medicalTitleShort()} />
        <EmptyState
          icon={Users}
          title={m.courseworkNoChildren()}
          description={m.courseworkNoChildrenBody()}
        />
      </Page>
    );
  return (
    <LearnerHealth
      key={child.studentId}
      studentId={child.studentId}
      name={displayName(child)}
    />
  );
}
