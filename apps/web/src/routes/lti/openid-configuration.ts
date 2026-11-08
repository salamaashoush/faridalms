import { createFileRoute } from "@tanstack/react-router";

import { ltiRelay } from "~/server/lti-relay";

/** How the school describes itself to a tool registering with it. */
export const Route = createFileRoute("/lti/openid-configuration")({
  server: {
    handlers: {
      GET: ({ request }) =>
        ltiRelay(request, "/lti/openid-configuration", "tool"),
    },
  },
});
