import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { PublicPageView } from "~/components/site/PublicPage";
import { publicPageQuery, publicSiteQuery } from "~/queries/site";

const site = getRouteApi("/site/$school");

export const Route = createFileRoute("/site/$school/pages/$slug")({
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      publicPageQuery(params.school, params.slug, deps.lang),
    ),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: loaderData.title },
          ...(loaderData.description
            ? [{ name: "description", content: loaderData.description }]
            : []),
        ]
      : [],
  }),
  component: SitePage,
});

function SitePage() {
  const { school, slug } = Route.useParams();
  const { lang } = site.useSearch();
  const shell = useSuspenseQuery(publicSiteQuery(school, lang)).data;
  const page = useSuspenseQuery(publicPageQuery(school, slug, lang)).data;
  return <PublicPageView page={page} site={shell} school={school} />;
}
