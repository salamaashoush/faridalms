import { createFileRoute } from "@tanstack/react-router";

import { cmi5Relay } from "~/server/cmi5-relay";

const relay = ({ request }: { request: Request }) => cmi5Relay(request);

/** Where a launched unit fetches its token for the record store, once. */
export const Route = createFileRoute("/cmi5/fetch")({
  server: {
    handlers: { GET: relay, POST: relay, OPTIONS: relay },
  },
});
