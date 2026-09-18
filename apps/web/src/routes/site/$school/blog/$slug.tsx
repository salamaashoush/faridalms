import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { ContentView } from "~/components/content/ContentView";
import { siteMediaUrl } from "~/components/site/SiteShell";
import { Badge } from "~/components/ui/badge";
import * as m from "~/i18n/messages";
import { publicPostQuery, publicSiteQuery } from "~/queries/site";
import { formatDate } from "~/utils/datetime";

export const Route = createFileRoute("/site/$school/blog/$slug")({
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ context, params, deps }) => {
    const site = await context.queryClient.ensureQueryData(
      publicSiteQuery({ school: params.school, locale: deps.lang }),
    );
    await context.queryClient.ensureQueryData(
      publicPostQuery({
        school: params.school,
        locale: site.locale,
        slug: params.slug,
      }),
    );
  },
  component: BlogPost,
});
function BlogPost() {
  const { school, slug } = Route.useParams();
  const { lang } = Route.useSearch();
  const site = useSuspenseQuery(publicSiteQuery({ school, locale: lang })).data;
  const { data } = useSuspenseQuery(
    publicPostQuery({ school, locale: site.locale, slug }),
  );
  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <time dateTime={data.publishAt.toISOString()}>
            {formatDate(data.publishAt.toISOString())}
          </time>
          {data.author ? <span>· {data.author}</span> : null}
          {data.category ? (
            <Link
              to="/site/$school/blog"
              params={{ school }}
              search={{
                lang: site.locale,
                category: data.category.slug,
                page: 1,
              }}
            >
              <Badge variant="secondary">{data.category.name}</Badge>
            </Link>
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {data.title}
        </h1>
        {data.summary ? (
          <p className="mt-3 text-lg text-muted-foreground">{data.summary}</p>
        ) : null}
      </header>
      {data.coverFileId ? (
        <img
          src={siteMediaUrl(school)(data.coverFileId)}
          alt=""
          className="mb-8 w-full rounded-2xl object-cover"
        />
      ) : null}
      <div className="rounded-2xl border bg-card p-6 sm:p-10">
        <ContentView document={data.document} />
      </div>
      <p className="mt-8">
        <Link
          to="/site/$school/blog"
          params={{ school }}
          search={{ lang: site.locale, category: "", page: 1 }}
          className="text-sm font-medium text-primary hover:underline"
        >
          {m.siteBackToBlog()}
        </Link>
      </p>
    </article>
  );
}
