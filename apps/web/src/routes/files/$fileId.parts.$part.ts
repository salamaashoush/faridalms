import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

/** One part of a large upload, passed straight through to the API. */
export const Route = createFileRoute("/files/$fileId/parts/$part")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        if (
          !/^[0-9a-f-]{36}$/.test(params.fileId) ||
          !/^\d{1,4}$/.test(params.part)
        )
          return Response.json({ code: "NOT_FOUND" }, { status: 404 });
        const prepared = relayTo(
          request,
          `/v1/files/${params.fileId}/parts/${params.part}`,
          ["content-type", "content-length"],
        );
        if ("refusal" in prepared) return prepared.refusal;
        return relayed(
          await fetch(prepared.target, {
            method: "PUT",
            headers: prepared.headers,
            body: request.body,
            // @ts-expect-error -- fetch needs duplex for a streamed request body.
            duplex: "half",
          }),
        );
      },
    },
  },
});
