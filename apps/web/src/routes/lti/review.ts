import { createFileRoute } from "@tanstack/react-router";

import { ltiRelay } from "~/server/lti-relay";

/** Starts a teacher's launch from a tool's score to the work behind it. */
export const Route = createFileRoute("/lti/review")({
  server: {
    handlers: {
      GET: ({ request }) => ltiRelay(request, "/lti/review"),
    },
  },
});
