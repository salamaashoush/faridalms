import { createFileRoute } from "@tanstack/react-router";

import { ltiRelay } from "~/server/lti-relay";

/** Where a tool registers itself with the token the school gave it. */
export const Route = createFileRoute("/lti/register")({
  server: {
    handlers: {
      POST: ({ request }) => ltiRelay(request, "/lti/register", "tool"),
    },
  },
});
