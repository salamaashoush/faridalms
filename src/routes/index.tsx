import { createFileRoute, redirect } from "@tanstack/react-router";

import { ROLE_HOME } from "~/data/identity";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    // Each role lands somewhere different, so "/" is a router decision rather
    // than a shared dashboard everybody then navigates away from.
    throw redirect({
      to: context.auth.role ? ROLE_HOME[context.auth.role] : "/sign-in",
    });
  },
});
