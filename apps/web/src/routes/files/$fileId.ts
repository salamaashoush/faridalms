import { createFileRoute } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";

import { env } from "~/env";
import { currentSchool, sessionCookie } from "~/server/backend";

const FORWARDED = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "content-disposition",
  "cache-control",
  "x-content-type-options",
];

function prepare(request: Request, fileId: string) {
  const school = currentSchool();
  const token = school ? getCookie(sessionCookie(school)) : undefined;
  if (!school || !token)
    return {
      refusal: Response.json({ code: "UNAUTHORIZED" }, { status: 401 }),
    };
  if (!/^[0-9a-f-]{36}$/.test(fileId))
    return { refusal: Response.json({ code: "NOT_FOUND" }, { status: 404 }) };
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    "x-farida-school": school,
  });
  for (const name of ["content-type", "content-length", "range"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const download = new URL(request.url).searchParams.has("download");
  return {
    headers,
    target: `${env.BACKEND_URL}/v1/files/${fileId}/content${download ? "?download" : ""}`,
  };
}

function relay(upstream: Response): Response {
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

/**
 * Bytes pass straight through to the API with the session token from the
 * HTTP-only cookie. The web never stores a file and never decides who may
 * read one; the API answers 404 for anyone it cannot authorise.
 */
export const Route = createFileRoute("/files/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const prepared = prepare(request, params.fileId);
        if ("refusal" in prepared) return prepared.refusal;
        return relay(
          await fetch(prepared.target, {
            method: "GET",
            headers: prepared.headers,
          }),
        );
      },
      PUT: async ({ request, params }) => {
        const prepared = prepare(request, params.fileId);
        if ("refusal" in prepared) return prepared.refusal;
        return relay(
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
