import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import * as v from "valibot";

import { LearnerDetails } from "~/components/people/LearnerDetails";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { emergencyContactsQuery } from "~/queries/emergency-contacts";
import { childrenQuery } from "~/queries/families";
import { learnerDetailsQuery } from "~/queries/home";
import { personRecordQuery } from "~/queries/students";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/family/details")({
  staticData: {
    breadcrumb: m.familyDetails,
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
    await Promise.all([
      context.queryClient.ensureQueryData(personRecordQuery(user.id)),
      ...(child
        ? [
            context.queryClient
              .ensureQueryData(learnerDetailsQuery(child))
              .then((details) =>
                details.decides
                  ? context.queryClient.ensureQueryData(
                      emergencyContactsQuery(child),
                    )
                  : null,
              ),
          ]
        : []),
    ]);
  },
  component: FamilyDetailsPage,
});

function FamilyDetailsPage() {
  const search = Route.useSearch();
  const user = useCurrentUser();
  const children = useSuspenseQuery(childrenQuery(user.id)).data;
  const studentId = search.studentId ?? children[0]?.studentId;
  if (!studentId)
    return (
      <Page width="record">
        <PageHeader title={m.familyDetails()} />
        <EmptyState
          icon={Users}
          title={m.courseworkNoChildren()}
          description={m.courseworkNoChildrenBody()}
        />
      </Page>
    );
  return <LearnerDetails key={studentId} studentId={studentId} />;
}
