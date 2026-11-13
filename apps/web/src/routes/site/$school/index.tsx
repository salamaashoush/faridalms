import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { listsClasses, PublicPageView } from "~/components/site/PublicPage";
import {
  publicClassesQuery,
  publicPageQuery,
  publicSiteQuery,
} from "~/queries/site";
import { siteHead } from "~/utils/seo";

const site = getRouteApi("/site/$school");

export const Route = createFileRoute("/site/$school/")({
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ context, params, deps }) => {
    const [shell, page] = await Promise.all([
      context.queryClient.ensureQueryData(
        publicSiteQuery(params.school, deps.lang),
      ),
      context.queryClient.ensureQueryData(
        publicPageQuery(params.school, "", deps.lang),
      ),
    ]);
    await context.queryClient.ensureQueryData(
      publicClassesQuery(params.school, deps.lang, listsClasses(page)),
    );
    return { shell, page };
  },
  head: ({ loaderData }) =>
    loaderData
      ? siteHead(loaderData.shell, {
          ...loaderData.page,
          // Search results name a school's home page by the school, not "Home".
          title: loaderData.shell.name,
        })
      : {},
  component: HomePage,
});

function HomePage() {
  const { school } = Route.useParams();
  const { lang } = site.useSearch();
  const shell = useSuspenseQuery(publicSiteQuery(school, lang)).data;
  const page = useSuspenseQuery(publicPageQuery(school, "", lang)).data;
  const { classes } = useSuspenseQuery(
    publicClassesQuery(school, lang, listsClasses(page)),
  ).data;
  return (
    <PublicPageView
      page={page}
      classes={classes}
      site={shell}
      school={school}
      slug=""
    />
  );
}
