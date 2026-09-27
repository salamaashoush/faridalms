import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { PublicPageView } from "~/components/site/PublicPage";
import { publicPageQuery, publicSiteQuery } from "~/queries/site";

const site = getRouteApi("/site/$school");

export const Route = createFileRoute("/site/$school/")({
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      publicPageQuery(params.school, "", deps.lang),
    ),
  head: ({ loaderData }) => ({
    meta: loaderData?.description
      ? [{ name: "description", content: loaderData.description }]
      : [],
  }),
  component: HomePage,
});

function HomePage() {
  const { school } = Route.useParams();
  const { lang } = site.useSearch();
  const shell = useSuspenseQuery(publicSiteQuery(school, lang)).data;
  const page = useSuspenseQuery(publicPageQuery(school, "", lang)).data;
  return <PublicPageView page={page} site={shell} school={school} slug="" />;
}
