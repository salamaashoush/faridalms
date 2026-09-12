import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "~/components/app/AppShell";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    }
  },
  loader: async ({ context }) => {
    // The shell reads this synchronously via useSuspenseQuery, so it has to be
    // in the cache before the first render rather than suspending the layout.
    await context.queryClient.ensureQueryData(currentUserQuery);
  },
  component: AppLayout,
});

// Pathless: it contributes no URL segment, only the auth gate and the chrome
// every signed-in route shares.
function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
