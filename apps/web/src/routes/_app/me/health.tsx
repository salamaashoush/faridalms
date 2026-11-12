import { createFileRoute } from "@tanstack/react-router";

import { LearnerHealth } from "~/components/health/LearnerHealth";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { summaryQuery } from "~/queries/records";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/me/health")({
  staticData: { breadcrumb: m.medicalTitleShort },
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    await context.queryClient.ensureQueryData(summaryQuery(user.id));
  },
  component: MyHealthPage,
});

function MyHealthPage() {
  const user = useCurrentUser();
  return <LearnerHealth studentId={user.id} name={user.name} />;
}
