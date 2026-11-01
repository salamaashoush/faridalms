import { createFileRoute } from "@tanstack/react-router";

import { BareSignIn } from "~/components/auth/BareSignIn";
import { PortalSignIn } from "~/components/auth/PortalSignIn";
import { leaveBareDomain } from "~/utils/bare-domain";
import { hostView } from "~/utils/host";

export const Route = createFileRoute("/_auth/sign-in")({
  beforeLoad: ({ context, location }) =>
    leaveBareDomain(context.auth, location.href),
  component: SignInPage,
});

function SignInPage() {
  return hostView().bare ? <BareSignIn /> : <PortalSignIn />;
}
