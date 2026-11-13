import { createFileRoute } from "@tanstack/react-router";

import { LearnerDetails } from "~/components/people/LearnerDetails";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { emergencyContactsQuery } from "~/queries/emergency-contacts";
import { learnerDetailsQuery } from "~/queries/home";
import { personRecordQuery } from "~/queries/students";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/me/details")({
  staticData: { breadcrumb: m.familyDetails },
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(personRecordQuery(user.id)),
      context.queryClient.ensureQueryData(learnerDetailsQuery(user.id)),
      context.queryClient.ensureQueryData(emergencyContactsQuery(user.id)),
    ]);
  },
  component: MyDetailsPage,
});

function MyDetailsPage() {
  return <LearnerDetails studentId={useCurrentUser().id} />;
}
