import { createFileRoute } from "@tanstack/react-router";

import { ltiRelay } from "~/server/lti-relay";

/** Starts a teacher's pick of an outside tool's content for a link. */
export const Route = createFileRoute("/lti/pick")({
  server: {
    handlers: {
      GET: ({ request }) => ltiRelay(request, "/lti/pick"),
    },
  },
});
