import { createFileRoute } from "@tanstack/react-router";

import { PersonProfile } from "~/components/records/PersonProfile";
import { personQuery } from "~/queries/people";

export const Route = createFileRoute("/_app/people/$userId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(personQuery(params.userId)),
  component: PersonPage,
});
function PersonPage() {
  const { userId } = Route.useParams();
  return <PersonProfile userId={userId} />;
}
