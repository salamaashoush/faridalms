import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { CalendarPage } from "~/components/communication/CalendarPage";
import { calendarQuery } from "~/queries/school";
import { calendarQuerySchema } from "~/schema/school";

export const Route = createFileRoute("/_app/family/calendar")({
  validateSearch: (search) => v.parse(calendarQuerySchema, search),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(calendarQuery(deps)),
  component: RouteComponent,
});

function RouteComponent() {
  return <CalendarPage search={Route.useSearch()} />;
}
