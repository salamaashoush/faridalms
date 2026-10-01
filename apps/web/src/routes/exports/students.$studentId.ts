import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

/** A student's portfolio: everything they have handed in, as one zip, from the API. */
export const Route = createFileRoute("/exports/students/$studentId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!/^[0-9a-f-]{36}$/.test(params.studentId))
          return Response.json({ code: "NOT_FOUND" }, { status: 404 });
        const prepared = relayTo(
          request,
          `/v1/students/${params.studentId}/portfolio.zip`,
        );
        if ("refusal" in prepared) return prepared.refusal;
        return relayed(
          await fetch(prepared.target, { headers: prepared.headers }),
        );
      },
    },
  },
});
