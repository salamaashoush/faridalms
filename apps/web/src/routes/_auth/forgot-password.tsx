import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordForm } from "~/components/auth/ForgotPasswordForm";

export const Route = createFileRoute("/_auth/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { auth } = Route.useRouteContext();
  return (
    <ForgotPasswordForm
      school={auth.school}
      schoolFromHost={auth.schoolFromHost}
    />
  );
}
