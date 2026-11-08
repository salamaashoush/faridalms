import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

/** Library items chosen together, downloaded as one zip from the API. */
export const Route = createFileRoute("/exports/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ids = new URL(request.url).searchParams.get("ids") ?? "";
        if (!/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,49}$/.test(ids))
          return Response.json({ code: "NOT_FOUND" }, { status: 404 });
        const prepared = relayTo(request, `/v1/media/library.zip?ids=${ids}`);
        if ("refusal" in prepared) return prepared.refusal;
        return relayed(
          await fetch(prepared.target, { headers: prepared.headers }),
        );
      },
    },
  },
});
