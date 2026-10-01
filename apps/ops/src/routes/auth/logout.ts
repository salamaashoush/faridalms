import { createFileRoute } from "@tanstack/react-router";

import { cookie, sessionCookie } from "../../server/session";

export const Route = createFileRoute("/auth/logout")({
  server: {
    handlers: {
      POST: () =>
        new Response(null, {
          status: 303,
          headers: {
            location: "/sign-in",
            "set-cookie": cookie(sessionCookie(), "", 0),
          },
        }),
    },
  },
});
