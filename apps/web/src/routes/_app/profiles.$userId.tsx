import { createFileRoute } from "@tanstack/react-router";

import { PersonProfile } from "~/components/people/PersonProfile";
import * as m from "~/i18n/messages";
import { personProfileQuery } from "~/queries/students";

export const Route = createFileRoute("/_app/profiles/$userId")({
  staticData: { breadcrumb: m.profileBreadcrumb },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(personProfileQuery(params.userId)),
  component: ProfilePage,
});

function ProfilePage() {
  const { userId } = Route.useParams();
  return <PersonProfile userId={userId} />;
}
