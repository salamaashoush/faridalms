import { createFileRoute } from "@tanstack/react-router";

import { relayed, relayTo } from "~/server/relay";

/**
 * What a reader may ask of a file besides its bytes: a download, a
 * picture's size (`w`), a document's first page (`page`), an office file as
 * PDF (`as`). Nothing else reaches the API.
 */
function asked(url: URL): string {
  const kept = new URLSearchParams();
  if (url.searchParams.has("download")) kept.set("download", "");
  const width = url.searchParams.get("w");
  if (width && /^\d{1,5}$/.test(width)) kept.set("w", width);
  if (url.searchParams.get("page") === "1") kept.set("page", "1");
  if (url.searchParams.get("as") === "pdf") kept.set("as", "pdf");
  const query = kept.toString();
  return query ? `?${query}` : "";
}

function prepare(request: Request, fileId: string) {
  if (!/^[0-9a-f-]{36}$/.test(fileId))
    return { refusal: Response.json({ code: "NOT_FOUND" }, { status: 404 }) };
  // The browser's Accept names the picture formats it draws, which the API
  // picks a size's format by.
  return relayTo(
    request,
    `/v1/files/${fileId}/content${asked(new URL(request.url))}`,
    ["content-type", "content-length", "range", "accept"],
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
