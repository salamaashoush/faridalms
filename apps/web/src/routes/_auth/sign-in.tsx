import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { BareSignIn } from "~/components/auth/BareSignIn";
import { PortalSignIn } from "~/components/auth/PortalSignIn";
import { leaveBareDomain } from "~/utils/bare-domain";
import { hostView } from "~/utils/host";

export const Route = createFileRoute("/_auth/sign-in")({
  // Where to go once signed in: a page of this portal, never another site.
  validateSearch: v.object({
    redirect: v.fallback(
      v.optional(v.pipe(v.string(), v.regex(/^\/(?!\/)/u))),
      undefined,
    ),
  }),
  beforeLoad: ({ context, location }) =>
    leaveBareDomain(context.auth, location.href),
  component: SignInPage,
});

function SignInPage() {
  const { redirect } = Route.useSearch();
  return hostView().bare ? (
    <BareSignIn />
  ) : (
    <PortalSignIn redirect={redirect} />
  );
}
