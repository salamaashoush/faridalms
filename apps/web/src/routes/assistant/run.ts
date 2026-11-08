import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

/**
 * A teacher's request to the school's language model, passed to the API
 * and its answer streamed back line by line as it is written. Closing the
 * request in the browser closes it at the API, which stops the provider.
 */
export const Route = createFileRoute("/assistant/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("content-type") !== "application/json")
          return Response.json({ code: "BAD_REQUEST" }, { status: 415 });
        const prepared = relayTo(request, "/v1/assistant/run", [
          "content-type",
        ]);
        if ("refusal" in prepared) return prepared.refusal;
        return relayed(
          await fetch(prepared.target, {
            method: "POST",
            headers: prepared.headers,
            body: await request.text(),
            signal: request.signal,
          }),
        );
      },
    },
  },
});
