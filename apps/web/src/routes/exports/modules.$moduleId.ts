import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

/**
 * What a module is exported as: its questions as QTI, all of it as a
 * Common Cartridge, or a class's results in it as xAPI statements.
 */
const EXPORTS: Record<string, string> = {
  qti: "questions.zip",
  cartridge: "cartridge.imscc",
  statements: "statements.json",
};

const ID = /^[0-9a-f-]{36}$/;

/** A module's content or results in a format other systems read, from the API. */
export const Route = createFileRoute("/exports/modules/$moduleId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const search = new URL(request.url).searchParams;
        const file = EXPORTS[search.get("as") ?? ""];
        const classId = search.get("classId") ?? "";
        if (
          !file ||
          !ID.test(params.moduleId) ||
          (classId && !ID.test(classId))
        )
          return Response.json({ code: "NOT_FOUND" }, { status: 404 });
        const prepared = relayTo(
          request,
          `/v1/modules/${params.moduleId}/${file}${classId ? `?classId=${classId}` : ""}`,
        );
        if ("refusal" in prepared) return prepared.refusal;
        return relayed(
          await fetch(prepared.target, { headers: prepared.headers }),
        );
      },
    },
  },
});
