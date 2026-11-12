import { AuthHeading } from "@faridalms/ui/system/auth-layout";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import * as v from "valibot";

import { RegisterForm } from "~/components/admissions/RegisterForm";
import { PortalHelp } from "~/components/auth/SchoolFace";
import * as m from "~/i18n/messages";
import { getRegistration } from "~/server/admissions";
import { leaveBareDomain } from "~/utils/bare-domain";

const auth = getRouteApi("/_auth");

export const Route = createFileRoute("/_auth/register")({
  validateSearch: v.object({
    intake: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  beforeLoad: ({ context, location }) =>
    leaveBareDomain(context.auth, location.href),
  loader: () => getRegistration(),
  component: RegisterPage,
});

/** The portal's registration page: someone registers here to apply, for themself or for someone in their care. */
function RegisterPage() {
  const face = auth.useLoaderData();
  const { intake } = Route.useSearch();
  const { forOthers } = Route.useLoaderData();
  return (
    <>
      <AuthHeading
        title={m.portalRegisterTitle()}
        lead={m.portalRegisterLead()}
      />
      <RegisterForm
        turnstileKey={face?.turnstileKey ?? null}
        intake={intake}
        forOthers={forOthers}
      />
      <PortalHelp face={face} topic="apply" />
    </>
  );
}
