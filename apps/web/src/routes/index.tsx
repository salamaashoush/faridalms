import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    // Each role lands somewhere different, so "/" is a router decision rather
    // than a shared dashboard everybody then navigates away from. A school's
    // website host never reaches here: its root is the website's home page.
    if (context.auth.workspace)
      throw redirect({ to: WORKSPACE_HOME[context.auth.workspace] });
    throw redirect({ to: "/sign-in" });
  },
});
