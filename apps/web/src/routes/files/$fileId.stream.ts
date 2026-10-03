import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

/** Where a video's adaptive streams are, once the media service has made them. */
export const Route = createFileRoute("/files/$fileId/stream")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!/^[0-9a-f-]{36}$/.test(params.fileId))
          return Response.json({ code: "NOT_FOUND" }, { status: 404 });
        const prepared = relayTo(request, `/v1/files/${params.fileId}/stream`, [
          "content-type",
        ]);
        if ("refusal" in prepared) return prepared.refusal;
        return relayed(
          await fetch(prepared.target, {
            method: "GET",
            headers: prepared.headers,
          }),
        );
      },
    },
  },
});
