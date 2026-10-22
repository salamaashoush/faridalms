import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

const ID = /^[0-9a-f-]{36}$/;

/** A class's modules and coursework as a Common Cartridge 1.3, from the API. */
export const Route = createFileRoute("/exports/classes/$classId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!ID.test(params.classId))
          return Response.json({ code: "NOT_FOUND" }, { status: 404 });
        const prepared = relayTo(
          request,
          `/v1/classes/${params.classId}/course.imscc`,
        );
        if ("refusal" in prepared) return prepared.refusal;
        return relayed(
          await fetch(prepared.target, { headers: prepared.headers }),
        );
      },
    },
  },
});
