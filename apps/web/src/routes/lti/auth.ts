import { createFileRoute } from "@tanstack/react-router";

import { ltiRelay } from "~/server/lti-relay";

/** The school's authorization endpoint, which a tool sends the browser to. */
export const Route = createFileRoute("/lti/auth")({
  server: {
    handlers: {
      GET: ({ request }) => ltiRelay(request, "/lti/auth"),
      POST: ({ request }) => ltiRelay(request, "/lti/auth"),
    },
  },
});
