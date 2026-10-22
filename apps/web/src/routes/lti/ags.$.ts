import { createFileRoute } from "@tanstack/react-router";

import { ltiRelay } from "~/server/lti-relay";

const relay = ({ request }: { request: Request }) =>
  ltiRelay(request, new URL(request.url).pathname, "tool");

/** The school's grade services, which tools report scores to. */
export const Route = createFileRoute("/lti/ags/$")({
  server: {
    handlers: { GET: relay, POST: relay, PUT: relay, DELETE: relay },
  },
});
