import { ROLE_HOME } from "@faridalms/domain/identity";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/family")({
  beforeLoad: ({ context }) => {
    // See the note in admin.tsx: the prefix is the role boundary.
    if (context.auth.role !== "parent") {
      throw redirect({
        to: context.auth.role ? ROLE_HOME[context.auth.role] : "/sign-in",
      });
    }
  },
  component: Outlet,
});
