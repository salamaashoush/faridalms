import { createFileRoute } from "@tanstack/react-router";

import { ltiRelay } from "~/server/lti-relay";

/** Where an outside tool sends back the content a teacher picked in it. */
export const Route = createFileRoute("/lti/deep-link")({
  server: {
    handlers: {
      POST: ({ request }) => ltiRelay(request, "/lti/deep-link"),
    },
  },
});
