import { createFileRoute } from "@tanstack/react-router";

import { cmi5Relay } from "~/server/cmi5-relay";

const relay = ({ request }: { request: Request }) => cmi5Relay(request);

/** The record store a course package's units report to. */
export const Route = createFileRoute("/cmi5/xapi/$")({
  server: {
    handlers: {
      GET: relay,
      PUT: relay,
      POST: relay,
      DELETE: relay,
      OPTIONS: relay,
    },
  },
});
