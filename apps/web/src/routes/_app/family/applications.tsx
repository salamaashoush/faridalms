import { createFileRoute } from "@tanstack/react-router";

import { MyApplications } from "~/components/admissions/MyApplications";
import * as m from "~/i18n/messages";
import { myApplicationsQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/family/applications")({
  staticData: { breadcrumb: m.famAppsTitle },
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "applications:submit");
    await context.queryClient.ensureQueryData(myApplicationsQuery);
  },
  component: MyApplications,
});
