import { AuthHeading } from "@faridalms/ui/system/auth-layout";
import { createFileRoute, getRouteApi, notFound } from "@tanstack/react-router";
import * as v from "valibot";

import { RegisterForm } from "~/components/admissions/RegisterForm";
import { usePortalWords } from "~/components/auth/portal-words";
import { PortalHelp } from "~/components/auth/SchoolFace";
import * as m from "~/i18n/messages";
import { faceQueryFor } from "~/queries/portal";
import { getRegistration } from "~/server/admissions";
import { leaveBareDomain } from "~/utils/bare-domain";

const auth = getRouteApi("/_auth");

export const Route = createFileRoute("/_auth/register")({
  validateSearch: v.object({
    intake: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  beforeLoad: ({ context, location }) =>
    leaveBareDomain(context.auth, location.href),
  loader: async ({ context }) => {
    const query = faceQueryFor(context.auth.school);
    const face = query
      ? await context.queryClient.ensureQueryData(query)
      : null;
    if (!face?.doors.includes("apply")) throw notFound();
    return getRegistration();
  },
  component: RegisterPage,
});

/** The portal's registration page: someone registers here to apply, for themself or for someone in their care. */
function RegisterPage() {
  const face = auth.useLoaderData();
  const { intake } = Route.useSearch();
  const { forOthers } = Route.useLoaderData();
  const words = usePortalWords(face);
  return (
    <>
      <AuthHeading
        title={m.portalRegisterTitle()}
        lead={words(m.portalRegisterLeadCore)()}
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
