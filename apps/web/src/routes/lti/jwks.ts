import { createFileRoute } from "@tanstack/react-router";

import { ltiRelay } from "~/server/lti-relay";

/** The school's public keys, which tools check its launches by. */
export const Route = createFileRoute("/lti/jwks")({
  server: {
    handlers: {
      GET: ({ request }) => ltiRelay(request, "/lti/jwks"),
    },
  },
});
