import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { PublicPostView } from "~/components/site/PublicPage";
import { publicPostQuery, publicSiteQuery } from "~/queries/site";

const site = getRouteApi("/site/$school");

export const Route = createFileRoute("/site/$school/news/$slug")({
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      publicPostQuery(params.school, params.slug, deps.lang),
    ),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.title }] : [],
  }),
  component: PostPage,
});

function PostPage() {
  const { school, slug } = Route.useParams();
  const { lang } = site.useSearch();
  const shell = useSuspenseQuery(publicSiteQuery(school, lang)).data;
  const post = useSuspenseQuery(publicPostQuery(school, slug, lang)).data;
  return <PublicPostView post={post} site={shell} school={school} />;
}
