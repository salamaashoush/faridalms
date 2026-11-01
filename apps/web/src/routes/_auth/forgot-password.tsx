import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordForm } from "~/components/auth/ForgotPasswordForm";
import { leaveBareDomain } from "~/utils/bare-domain";

export const Route = createFileRoute("/_auth/forgot-password")({
  beforeLoad: ({ context, location }) =>
    leaveBareDomain(context.auth, location.href),
  component: ForgotPasswordForm,
});
