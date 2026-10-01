import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

function prepare(request: Request, fileId: string) {
  if (!/^[0-9a-f-]{36}$/.test(fileId))
    return { refusal: Response.json({ code: "NOT_FOUND" }, { status: 404 }) };
  const download = new URL(request.url).searchParams.has("download");
  return relayTo(
    request,
    `/v1/files/${fileId}/content${download ? "?download" : ""}`,
    ["content-type", "content-length", "range"],
  );
}

export const Route = createFileRoute("/files/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const prepared = prepare(request, params.fileId);
        if ("refusal" in prepared) return prepared.refusal;
        return relayed(
          // The API answers with a signed link on the files host; the
          // browser follows it, so the bytes never pass through here.
          await fetch(prepared.target, {
            method: "GET",
            headers: prepared.headers,
            redirect: "manual",
          }),
        );
      },
      PUT: async ({ request, params }) => {
        const prepared = prepare(request, params.fileId);
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
