import { sitePostPath } from "@faridalms/domain/site-seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { PublicPostView } from "~/components/site/PublicPage";
import { orRedirect } from "~/components/site/redirect";
import { publicPostQuery, publicSiteQuery } from "~/queries/site";
import { siteHead } from "~/utils/seo";

const site = getRouteApi("/site/$school");

export const Route = createFileRoute("/site/$school/news/$slug")({
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ context, params, deps }) => {
    const [shell, post] = await Promise.all([
      context.queryClient.ensureQueryData(
        publicSiteQuery(params.school, deps.lang),
      ),
      orRedirect(
        context.queryClient.ensureQueryData(
          publicPostQuery(params.school, params.slug, deps.lang),
        ),
        params.school,
        sitePostPath(params.slug),
        deps.lang,
      ),
    ]);
    return { shell, post };
  },
  head: ({ loaderData }) =>
    loaderData
      ? siteHead(loaderData.shell, {
          kind: "article",
          title: loaderData.post.title,
          description: loaderData.post.excerpt,
          path: sitePostPath(loaderData.post.slug),
          locales: [],
          indexed: true,
          canonical: "",
          socialPicture: loaderData.post.coverKey
            ? {
                key: loaderData.post.coverKey,
                alt: loaderData.post.coverAlt,
              }
            : null,
        })
      : {},
  component: PostPage,
});

function PostPage() {
  const { school, slug } = Route.useParams();
  const { lang } = site.useSearch();
  const shell = useSuspenseQuery(publicSiteQuery(school, lang)).data;
  const post = useSuspenseQuery(publicPostQuery(school, slug, lang)).data;
  return <PublicPostView post={post} site={shell} school={school} />;
}
