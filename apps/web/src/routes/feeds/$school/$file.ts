import { createFileRoute } from "@tanstack/react-router";

import { env } from "~/env";

/**
 * A person's private calendar link, polled by calendar apps without a
 * session. The API answers; this route keeps the apps on the school's host.
 */
export const Route = createFileRoute("/feeds/$school/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (
          !/^[a-z0-9-]{1,60}$/.test(params.school) ||
          !/^[A-Za-z0-9_-]{43}\.ics$/.test(params.file)
        )
          return Response.json({ code: "NOT_FOUND" }, { status: 404 });
        const upstream = await fetch(
          `${env.BACKEND_URL}/feeds/${params.school}/${params.file}`,
        );
        const headers = new Headers({ "cache-control": "no-store" });
        const type = upstream.headers.get("content-type");
        if (type) headers.set("content-type", type);
        return new Response(upstream.body, {
          status: upstream.status,
          headers,
        });
      },
    },
  },
});
