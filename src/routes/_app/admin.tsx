import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { ROLE_HOME } from "~/data/identity";

export const Route = createFileRoute("/_app/admin")({
  beforeLoad: ({ context }) => {
    // The prefix is the role boundary. Server functions authorise their own
    // data, but without this a parent opening /admin gets the chrome, the
    // headings and a page full of failed requests instead of a clean bounce.
    if (context.auth.role !== "admin") {
      throw redirect({
        to: context.auth.role ? ROLE_HOME[context.auth.role] : "/sign-in",
      });
    }
  },
  component: Outlet,
});
