import { siteLocaleSchema } from "@faridalms/domain/site";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import * as v from "valibot";

import { SiteShell } from "~/components/site/SiteShell";
import { publicSiteQuery } from "~/queries/site";

export const Route = createFileRoute("/site/$school")({
  validateSearch: v.object({ lang: v.optional(siteLocaleSchema) }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      publicSiteQuery({ school: params.school, locale: deps.lang }),
    ),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.school.name }] : [],
  }),
  component: SiteLayout,
});
function SiteLayout() {
  const { school } = Route.useParams();
  const { lang } = Route.useSearch();
  const { data } = useSuspenseQuery(publicSiteQuery({ school, locale: lang }));
  return (
    <SiteShell site={data} school={school}>
      <Outlet />
    </SiteShell>
  );
}
