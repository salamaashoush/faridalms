import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { ROLE_HOME } from "~/data/identity";

export const Route = createFileRoute("/_app/teach")({
  beforeLoad: ({ context }) => {
    // See the note in admin.tsx: the prefix is the role boundary.
    if (context.auth.role !== "teacher") {
      throw redirect({
        to: context.auth.role ? ROLE_HOME[context.auth.role] : "/sign-in",
      });
    }
  },
  component: Outlet,
});
