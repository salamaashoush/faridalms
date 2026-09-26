import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSchoolForCurrentHost } from "~/server/site";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    // Each role lands somewhere different, so "/" is a router decision rather
    // than a shared dashboard everybody then navigates away from. A visitor on
    // a school's own domain lands on that school's public site.
    if (context.auth.workspace)
      throw redirect({ to: WORKSPACE_HOME[context.auth.workspace] });
    const school = await getSchoolForCurrentHost();
    if (school)
      throw redirect({
        to: "/site/$school",
        params: { school: school.slug },
        search: {},
      });
    throw redirect({ to: "/sign-in" });
  },
});
