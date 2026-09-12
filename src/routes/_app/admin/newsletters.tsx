import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { NewslettersPage } from "~/components/communication/NewslettersPage";
import { newslettersQuery } from "~/queries/school";
import { newslettersQuerySchema } from "~/schema/school";

export const Route = createFileRoute("/_app/admin/newsletters")({
  validateSearch: (search) => v.parse(newslettersQuerySchema, search),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(newslettersQuery(deps)),
  component: RouteComponent,
});

function RouteComponent() {
  return <NewslettersPage search={Route.useSearch()} />;
}
