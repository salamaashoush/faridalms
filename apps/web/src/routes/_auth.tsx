import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { faceName, PortalLayout } from "~/components/auth/SchoolFace";
import { faceQueryFor } from "~/queries/portal";

export const Route = createFileRoute("/_auth")({
  staticData: { schoolFace: true },
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      // "/" resolves to the role home, so a signed-in visitor never sees
      // the sign-in form.
      throw redirect({ to: "/" });
    }
  },
  // On a school's portal the pages carry its name and colour; the bare
  // domain keeps the platform's, since it names no school.
  loader: ({ context }) => {
    const query = faceQueryFor(context.auth.school);
    return query ? context.queryClient.ensureQueryData(query) : null;
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: faceName(loaderData) }] : [],
  }),
  component: AuthHome,
});

function AuthHome() {
  const face = Route.useLoaderData();
  return (
    <PortalLayout face={face}>
      <Outlet />
    </PortalLayout>
  );
}
