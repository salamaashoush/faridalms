import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { NewsletterSections } from "~/components/communication/NewsletterDocument";
import { siteMediaUrl } from "~/components/site/SiteShell";
import { publicPageQuery, publicSiteQuery } from "~/queries/site";

export const Route = createFileRoute("/site/$school/pages/$slug")({
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ context, params, deps }) => {
    const site = await context.queryClient.ensureQueryData(
      publicSiteQuery({ school: params.school, locale: deps.lang }),
    );
    await context.queryClient.ensureQueryData(
      publicPageQuery({
        school: params.school,
        locale: site.locale,
        slug: params.slug,
      }),
    );
  },
  component: SitePage,
});
function SitePage() {
  const { school, slug } = Route.useParams();
  const { lang } = Route.useSearch();
  const site = useSuspenseQuery(publicSiteQuery({ school, locale: lang })).data;
  const { data } = useSuspenseQuery(
    publicPageQuery({ school, locale: site.locale, slug }),
  );
  return (
    <article>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {data.title}
        </h1>
        {data.summary ? (
          <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
            {data.summary}
          </p>
        ) : null}
      </header>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <NewsletterSections
          document={data.document}
          assetUrl={siteMediaUrl(school)}
        />
      </div>
    </article>
  );
}
