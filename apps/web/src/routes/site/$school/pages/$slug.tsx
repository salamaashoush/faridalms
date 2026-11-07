import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { PublicPageView } from "~/components/site/PublicPage";
import { orRedirect } from "~/components/site/redirect";
import { publicPageQuery, publicSiteQuery } from "~/queries/site";
import { siteHead } from "~/utils/seo";

const site = getRouteApi("/site/$school");

export const Route = createFileRoute("/site/$school/pages/$slug")({
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ context, params, deps }) => {
    const [shell, page] = await Promise.all([
      context.queryClient.ensureQueryData(
        publicSiteQuery(params.school, deps.lang),
      ),
      orRedirect(
        context.queryClient.ensureQueryData(
          publicPageQuery(params.school, params.slug, deps.lang),
        ),
        params.school,
        `/pages/${params.slug}`,
        deps.lang,
      ),
    ]);
    return { shell, page };
  },
  head: ({ loaderData }) =>
    loaderData ? siteHead(loaderData.shell, loaderData.page) : {},
  component: SitePage,
});

function SitePage() {
  const { school, slug } = Route.useParams();
  const { lang } = site.useSearch();
  const shell = useSuspenseQuery(publicSiteQuery(school, lang)).data;
  const page = useSuspenseQuery(publicPageQuery(school, slug, lang)).data;
  return (
    <PublicPageView page={page} site={shell} school={school} slug={slug} />
  );
}
