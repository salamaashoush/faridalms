import { siteSlugSchema } from "@faridalms/domain/website";
import { cn } from "@faridalms/ui/cn";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  getRouteApi,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import * as v from "valibot";

import { NewsFrame, PostList } from "~/components/site/PublicPage";
import { langSearch } from "~/components/site/SiteShell";
import * as m from "~/i18n/messages";
import { publicPostsQuery, publicSiteQuery } from "~/queries/site";

const site = getRouteApi("/site/$school");

const searchSchema = v.object({
  category: v.fallback(
    v.optional(v.union([v.literal(""), siteSlugSchema]), ""),
    "",
  ),
  page: v.fallback(
    v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    1,
  ),
});

export const Route = createFileRoute("/site/$school/news/")({
  validateSearch: searchSchema,
  search: {
    middlewares: [stripSearchParams({ category: "", page: 1 })],
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      publicPostsQuery(params.school, {
        category: deps.category,
        page: deps.page,
        locale: deps.lang,
      }),
    ),
  component: NewsPage,
});

const chip =
  "inline-flex min-h-10 items-center rounded-full border border-[var(--s-border)] px-4 text-sm font-medium hover:bg-[var(--s-card)] aria-[current=true]:border-[var(--s-btn)] aria-[current=true]:bg-[var(--s-btn)] aria-[current=true]:text-[var(--s-btn-fg)]";

function NewsPage() {
  const { school } = Route.useParams();
  const { lang } = site.useSearch();
  const search = Route.useSearch();
  const shell = useSuspenseQuery(publicSiteQuery(school, lang)).data;
  const data = useSuspenseQuery(
    publicPostsQuery(school, {
      category: search.category,
      page: search.page,
      locale: lang,
    }),
  ).data;
  const t = { locale: shell.locale };
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const to = (change: { category?: string; page?: number }) => ({
    ...langSearch(shell),
    category: change.category ?? search.category,
    page: change.page ?? 1,
  });
  return (
    <NewsFrame site={shell} school={school} title={m.siteNews({}, t)}>
      {shell.categories.length ? (
        <nav aria-label={m.siteCategories({}, t)}>
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link
                to="/site/$school/news"
                params={{ school }}
                search={to({ category: "" })}
                aria-current={search.category === "" ? "true" : undefined}
                className={chip}
              >
                {m.siteAllCategories({}, t)}
              </Link>
            </li>
            {shell.categories.map((category) => (
              <li key={category.slug}>
                <Link
                  to="/site/$school/news"
                  params={{ school }}
                  search={to({ category: category.slug })}
                  aria-current={
                    search.category === category.slug ? "true" : undefined
                  }
                  className={chip}
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <PostList posts={data.rows} site={shell} school={school} />
      {pages > 1 ? (
        <nav
          aria-label={m.sitePagination({}, t)}
          className="flex items-center justify-between gap-3"
        >
          <Link
            to="/site/$school/news"
            params={{ school }}
            search={to({ page: Math.max(1, search.page - 1) })}
            aria-disabled={search.page <= 1 || undefined}
            className={cn(
              chip,
              search.page <= 1 && "pointer-events-none opacity-50",
            )}
          >
            {m.sitePrevious({}, t)}
          </Link>
          <span className="site-muted text-sm">
            {m.sitePageOf({ page: search.page, pages }, t)}
          </span>
          <Link
            to="/site/$school/news"
            params={{ school }}
            search={to({ page: Math.min(pages, search.page + 1) })}
            aria-disabled={search.page >= pages || undefined}
            className={cn(
              chip,
              search.page >= pages && "pointer-events-none opacity-50",
            )}
          >
            {m.siteNext({}, t)}
          </Link>
        </nav>
      ) : null}
    </NewsFrame>
  );
}
