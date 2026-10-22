import { createFileRoute } from "@tanstack/react-router";

import { ltiRelay } from "~/server/lti-relay";

/** Starts a launch of an outside tool from a link in a lesson or brief. */
export const Route = createFileRoute("/lti/launch")({
  server: {
    handlers: {
      GET: ({ request }) => ltiRelay(request, "/lti/launch"),
    },
  },
});
