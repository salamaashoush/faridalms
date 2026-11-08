import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/me")({
  beforeLoad: ({ context }) => {
    // See the note in _staff.tsx: the prefix is the context boundary.
    if (context.auth.workspace !== "me") {
      throw redirect({
        to: context.auth.workspace
          ? WORKSPACE_HOME[context.auth.workspace]
          : "/sign-in",
      });
    }
  },
  component: Outlet,
});
