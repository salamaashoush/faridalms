import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AuthLayout } from "~/components/auth/AuthLayout";
import { faceName } from "~/components/auth/SchoolFace";
import { faceQueryFor, linkedSchool } from "~/queries/portal";
import siteCss from "~/styles/site.css?url";

export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      // "/" resolves to the role home, so a signed-in visitor never sees
      // the sign-in form.
      throw redirect({ to: "/" });
    }
  },
  // On a school's portal the pages wear the school's face; the bare domain
  // keeps the platform's, since the school there is only being chosen.
  loader: ({ context }) => {
    const query = faceQueryFor(linkedSchool(context.auth, undefined));
    return query ? context.queryClient.ensureQueryData(query) : null;
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: faceName(loaderData) }] : [],
    // The school's theme faces, which its side of the page is set in.
    links: loaderData ? [{ rel: "stylesheet", href: siteCss }] : [],
  }),
  component: AuthHome,
});

function AuthHome() {
  const face = Route.useLoaderData();
  return (
    <AuthLayout face={face}>
      <Outlet />
    </AuthLayout>
  );
}
