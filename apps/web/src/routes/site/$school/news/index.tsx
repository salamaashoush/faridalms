import { siteSlugSchema } from "@faridalms/domain/website";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  getRouteApi,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import * as v from "valibot";

import { PostList } from "~/components/site/PublicPage";
import { langSearch } from "~/components/site/SiteShell";
import * as m from "~/i18n/messages";
import { publicPostsQuery, publicSiteQuery } from "~/queries/site";
import { cn } from "~/utils/cn";

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
  "inline-flex min-h-9 items-center rounded-full border px-3 text-sm hover:bg-muted aria-[current=true]:border-primary aria-[current=true]:bg-primary/10 aria-[current=true]:text-primary";

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
    <div className="grid gap-8">
      <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
        {m.siteNews({}, t)}
      </h1>
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
          <span className="text-sm text-muted-foreground">
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
    </div>
  );
}
