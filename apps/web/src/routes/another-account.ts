import { createFileRoute } from "@tanstack/react-router";

import { SCHOOL_COOKIE } from "~/server/backend";

/**
 * "Use another account": the bare portal domain forgets the school it
 * remembered and asks for an email again.
 */
export const Route = createFileRoute("/another-account")({
  server: {
    handlers: {
      GET: () =>
        new Response(null, {
          status: 303,
          headers: {
            location: "/sign-in",
            "cache-control": "no-store",
            "set-cookie": `${SCHOOL_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
          },
        }),
    },
  },
});
