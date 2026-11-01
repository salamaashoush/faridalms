import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";

import { AuthLayout } from "~/components/auth/AuthLayout";
import { faceName } from "~/components/auth/SchoolFace";
import { faceQueryFor } from "~/queries/portal";
import siteCss from "~/styles/site.css?url";

export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      // "/" resolves to the role home, so a signed-in visitor never sees
      // the sign-in form.
      throw redirect({ to: "/" });
    }
  },
  // On a school's portal the pages are the portal page of the school's site;
  // the bare domain keeps the platform's, since it names no school.
  loader: ({ context }) => {
    const query = faceQueryFor(context.auth.school);
    return query ? context.queryClient.ensureQueryData(query) : null;
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: faceName(loaderData) }] : [],
    // The school's theme faces, which its portal page is set in.
    links: loaderData ? [{ rel: "stylesheet", href: siteCss }] : [],
  }),
  component: AuthHome,
});

function AuthHome() {
  const face = Route.useLoaderData();
  // Sign-in shows the section's own words over the form; every other page
  // of the flow says its own heading.
  const ownWords = useLocation().pathname !== "/sign-in";
  return (
    <AuthLayout face={face} ownWords={ownWords}>
      <Outlet />
    </AuthLayout>
  );
}
