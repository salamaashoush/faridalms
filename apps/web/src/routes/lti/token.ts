import { createFileRoute } from "@tanstack/react-router";

import { ltiRelay } from "~/server/lti-relay";

/** The school's token endpoint, where a tool asks to use the grade services. */
export const Route = createFileRoute("/lti/token")({
  server: {
    handlers: {
      POST: ({ request }) => ltiRelay(request, "/lti/token", "tool"),
    },
  },
});
