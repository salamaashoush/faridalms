import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

async function relay(request: Request, fileId: string, method: "GET" | "POST") {
  if (!/^[0-9a-f-]{36}$/.test(fileId))
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const prepared = relayTo(request, `/v1/files/${fileId}/parts`);
  if ("refusal" in prepared) return prepared.refusal;
  return relayed(
    await fetch(prepared.target, { method, headers: prepared.headers }),
  );
}

/**
 * Joins the parts of a large upload once the last has been sent, and says
 * which parts the server holds, for an upload picked up after a reload.
 */
export const Route = createFileRoute("/files/$fileId/parts")({
  server: {
    handlers: {
      GET: ({ request, params }) => relay(request, params.fileId, "GET"),
      POST: ({ request, params }) => relay(request, params.fileId, "POST"),
    },
  },
});
