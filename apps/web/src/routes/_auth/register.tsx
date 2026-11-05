import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import * as v from "valibot";

import { RegisterForm } from "~/components/admissions/RegisterForm";
import { leaveBareDomain } from "~/utils/bare-domain";

const auth = getRouteApi("/_auth");

export const Route = createFileRoute("/_auth/register")({
  validateSearch: v.object({
    intake: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  beforeLoad: ({ context, location }) =>
    leaveBareDomain(context.auth, location.href),
  component: RegisterPage,
});

/** The portal's registration door: a family registers here to apply. */
function RegisterPage() {
  const face = auth.useLoaderData();
  const { intake } = Route.useSearch();
  return (
    <RegisterForm turnstileKey={face?.turnstileKey ?? null} intake={intake} />
  );
}
