import { createFileRoute, redirect } from "@tanstack/react-router";

import { ADMISSIONS_NAV } from "~/components/admissions/contributions";
import { firstPageOf } from "~/components/app/navigation";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";
import { pageOn } from "~/utils/pages";

/** The Admissions link lands on the first of its pages the person may open. */
export const Route = createFileRoute("/_app/admissions/")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    const first = firstPageOf(ADMISSIONS_NAV, {
      capabilities: user.capabilities,
      opens: (path) => pageOn(context.extensions, user.modules, path),
    });
    if (first) throw redirect({ to: first, replace: true });
    // Nothing of it is theirs: home, as any page they may not open.
    requirePage(user);
  },
});
