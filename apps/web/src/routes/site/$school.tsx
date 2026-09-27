import { SITE_LOCALES } from "@faridalms/domain/website";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import * as v from "valibot";

import { SiteShell } from "~/components/site/SiteShell";
import { publicSiteQuery } from "~/queries/site";

/** A school's public website. No one signs in here; the address names the school. */
export const Route = createFileRoute("/site/$school")({
  validateSearch: v.object({
    lang: v.fallback(v.optional(v.picklist(SITE_LOCALES)), undefined),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      publicSiteQuery(params.school, deps.lang),
    ),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.name }] : [],
  }),
  component: SiteLayout,
});

function SiteLayout() {
  const { school } = Route.useParams();
  const { lang } = Route.useSearch();
  const site = useSuspenseQuery(publicSiteQuery(school, lang)).data;
  return (
    <SiteShell site={site} school={school}>
      <Outlet />
    </SiteShell>
  );
}
