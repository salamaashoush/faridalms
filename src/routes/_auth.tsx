import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AuthLayout } from "~/components/auth/AuthLayout";

export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      // "/" resolves to the role home, so a signed-in visitor never sees
      // the sign-in form.
      throw redirect({ to: "/" });
    }
  },
  component: AuthHome,
});

function AuthHome() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  );
}
