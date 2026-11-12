import { createFileRoute } from "@tanstack/react-router";

import { MyApplications } from "~/components/admissions/MyApplications";
import * as m from "~/i18n/messages";
import { myApplicationsQuery } from "~/queries/admissions";

export const Route = createFileRoute("/_app/me/applications")({
  staticData: { breadcrumb: m.famAppsTitle },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(myApplicationsQuery),
  component: MyApplications,
});
