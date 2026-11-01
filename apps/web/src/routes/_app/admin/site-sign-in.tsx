import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { SignInPageEditor } from "~/components/site/SignInPageEditor";
import * as m from "~/i18n/messages";
import { signInPageQuery, siteOverviewQuery } from "~/queries/site";
import { currentUserQuery } from "~/queries/user";
import siteCss from "~/styles/site.css?url";

export const Route = createFileRoute("/_app/admin/site-sign-in")({
  staticData: { breadcrumb: m.signInPageTitle, section: "/admin/site" },
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("site:manage"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await Promise.all([
      context.queryClient.ensureQueryData(signInPageQuery),
      context.queryClient.ensureQueryData(siteOverviewQuery),
    ]);
  },
  head: () => ({
    meta: [{ title: m.signInPageTitle() }],
    links: [{ rel: "stylesheet", href: siteCss }],
  }),
  component: EditorPage,
});

function EditorPage() {
  const navigate = Route.useNavigate();
  const existing = useSuspenseQuery(signInPageQuery).data;
  return (
    <SignInPageEditor
      existing={existing}
      onClose={() => void navigate({ to: "/admin/site", search: {} })}
    />
  );
}
