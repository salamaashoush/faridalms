import { createFileRoute, redirect } from "@tanstack/react-router";

import { calendarEventQuery } from "~/queries/calendar";

/**
 * Feeds, notifications and search link here; the event opens in its panel
 * over the month it falls in.
 */
export const Route = createFileRoute("/_app/calendar/$eventId")({
  loader: async ({ context, params }) => {
    const event = await context.queryClient.ensureQueryData(
      calendarEventQuery(params.eventId),
    );
    throw redirect({
      to: "/calendar",
      search: { event: event.id, month: event.startsOn.slice(0, 7) },
      replace: true,
    });
  },
});
