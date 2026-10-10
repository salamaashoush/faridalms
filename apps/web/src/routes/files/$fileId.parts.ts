import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

/** Joins the parts of a large upload, once the last has been sent. */
export const Route = createFileRoute("/files/$fileId/parts")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!/^[0-9a-f-]{36}$/.test(params.fileId))
          return Response.json({ code: "NOT_FOUND" }, { status: 404 });
        const prepared = relayTo(request, `/v1/files/${params.fileId}/parts`);
        if ("refusal" in prepared) return prepared.refusal;
        return relayed(
          await fetch(prepared.target, {
            method: "POST",
            headers: prepared.headers,
          }),
        );
      },
    },
  },
});
