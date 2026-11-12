import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

/**
 * What a module is exported as: its questions as QTI 3 or as Canvas's own
 * QTI 1.2 quizzes, or all of it as a Common Cartridge.
 */
const EXPORTS: Record<string, string> = {
  qti: "questions.zip",
  cartridge: "cartridge.imscc",
  canvas: "canvas-quizzes.zip",
};

const ID = /^[0-9a-f-]{36}$/;

/** A module's content in a format other systems read, from the API. */
export const Route = createFileRoute("/exports/modules/$moduleId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const file = EXPORTS[new URL(request.url).searchParams.get("as") ?? ""];
        if (!file || !ID.test(params.moduleId))
          return Response.json({ code: "NOT_FOUND" }, { status: 404 });
        const prepared = relayTo(
          request,
          `/v1/modules/${params.moduleId}/${file}`,
        );
        if ("refusal" in prepared) return prepared.refusal;
        return relayed(
          await fetch(prepared.target, { headers: prepared.headers }),
        );
      },
    },
  },
});
