import { createFileRoute } from "@tanstack/react-router";

import { env } from "~/env";

const FORWARDED = [
  "content-type",
  "content-length",
  "content-disposition",
  "cache-control",
  "x-content-type-options",
];

/**
 * Public site media passes through without a session. The API decides what
 * the public may see; this route only keeps the browser off the API host.
 */
export const Route = createFileRoute("/site-media/$school/$fileId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.school) ||
          !/^[0-9a-f-]{36}$/.test(params.fileId)
        )
          return Response.json({ code: "NOT_FOUND" }, { status: 404 });
        const upstream = await fetch(
          `${env.BACKEND_URL}/v1/sites/${params.school}/files/${params.fileId}/content`,
        );
        const headers = new Headers();
        for (const name of FORWARDED) {
          const value = upstream.headers.get(name);
          if (value) headers.set(name, value);
        }
        return new Response(upstream.body, {
          status: upstream.status,
          headers,
        });
      },
    },
  },
});
