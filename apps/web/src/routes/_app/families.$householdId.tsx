import { createFileRoute } from "@tanstack/react-router";

import { HouseholdRecord } from "~/components/people/Households";
import * as m from "~/i18n/messages";
import { householdQuery } from "~/queries/households";

export const Route = createFileRoute("/_app/families/$householdId")({
  staticData: {
    breadcrumb: m.householdBreadcrumb,
    section: "/admin/families",
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(householdQuery(params.householdId)),
  component: HouseholdPage,
});

function HouseholdPage() {
  const { householdId } = Route.useParams();
  return <HouseholdRecord householdId={householdId} />;
}
