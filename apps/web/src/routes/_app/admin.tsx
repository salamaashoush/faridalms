import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin")({
  beforeLoad: ({ context }) => {
    // The prefix is the role boundary. Server functions authorise their own
    // data, but without this a parent opening /admin gets the chrome, the
    // headings and a page full of failed requests instead of a clean bounce.
    if (context.auth.workspace !== "admin") {
      throw redirect({
        to: context.auth.workspace
          ? WORKSPACE_HOME[context.auth.workspace]
          : "/sign-in",
      });
    }
  },
  component: Outlet,
});
