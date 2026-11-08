import { createFileRoute } from "@tanstack/react-router";

import { ltiRelay } from "~/server/lti-relay";

/** The school's class lists, which tools read with a token. */
export const Route = createFileRoute("/lti/nrps/$")({
  server: {
    handlers: {
      GET: ({ request }) =>
        ltiRelay(request, new URL(request.url).pathname, "tool"),
    },
  },
});
