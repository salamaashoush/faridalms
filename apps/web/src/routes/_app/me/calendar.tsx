import { calendarQuerySchema } from "@faridalms/domain/school-schema";
import { createFileRoute } from "@tanstack/react-router";

import { CalendarPage } from "~/components/communication/CalendarPage";
import { calendarQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/me/calendar")({
  validateSearch: calendarQuerySchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(calendarQuery(deps)),
  component: RouteComponent,
});

function RouteComponent() {
  return <CalendarPage search={Route.useSearch()} />;
}
