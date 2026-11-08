import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

/** Launches a unit of a lesson's course package for the person signed in. */
export const Route = createFileRoute("/cmi5/launch")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const prepared = relayTo(
          request,
          `/cmi5/launch${new URL(request.url).search}`,
        );
        if ("refusal" in prepared) return prepared.refusal;
        // The API answers with the unit's address; the browser goes there.
        return relayed(
          await fetch(prepared.target, {
            headers: prepared.headers,
            redirect: "manual",
          }),
        );
      },
    },
  },
});
