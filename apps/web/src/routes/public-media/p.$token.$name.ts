import { createFileRoute } from "@tanstack/react-router";

import { env } from "~/env";

const FORWARDED = [
  "content-type",
  "content-disposition",
  "cache-control",
  "x-content-type-options",
  "access-control-allow-origin",
];

/**
 * Published files, served to anyone without a session. In production the
 * public-media domain serves the bucket directly; here the API does, and this
 * route only keeps the browser off the API host.
 */
export const Route = createFileRoute("/public-media/p/$token/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (
          !/^[a-z0-9]{26}$/.test(params.token) ||
          !/^[A-Za-z0-9._-]{1,120}$/.test(params.name)
        )
          return Response.json({ code: "NOT_FOUND" }, { status: 404 });
        const upstream = await fetch(
          `${env.BACKEND_URL}/public-media/p/${params.token}/${params.name}`,
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
