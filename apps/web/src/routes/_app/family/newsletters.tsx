import { newslettersQuerySchema } from "@faridalms/domain/school-schema";
import { createFileRoute } from "@tanstack/react-router";

import { NewslettersPage } from "~/components/communication/NewslettersPage";
import { newslettersQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/family/newsletters")({
  validateSearch: newslettersQuerySchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(newslettersQuery(deps)),
  component: RouteComponent,
});

function RouteComponent() {
  return <NewslettersPage search={Route.useSearch()} />;
}
