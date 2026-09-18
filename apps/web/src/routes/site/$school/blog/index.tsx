import { siteSlugSchema } from "@faridalms/domain/site";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import * as v from "valibot";

import { ButtonLink } from "~/components/app/ButtonLink";
import { PostList } from "~/components/site/PostList";
import * as m from "~/i18n/messages";
import { publicPostsQuery, publicSiteQuery } from "~/queries/site";
import { cn } from "~/utils/cn";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/site/$school/blog/")({
  validateSearch: v.object({
    category: v.optional(v.union([v.literal(""), siteSlugSchema]), ""),
    page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    const site = await context.queryClient.ensureQueryData(
      publicSiteQuery({ school: params.school, locale: deps.lang }),
    );
    await context.queryClient.ensureQueryData(
      publicPostsQuery({
        school: params.school,
        locale: site.locale,
        category: deps.category,
        page: deps.page,
      }),
    );
  },
  component: BlogIndex,
});
const chip =
  "rounded-full border px-3 py-1 text-sm hover:bg-muted aria-[current=true]:border-primary aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground";
function BlogIndex() {
  const { school } = Route.useParams();
  const search = Route.useSearch();
  const site = useSuspenseQuery(
    publicSiteQuery({ school, locale: search.lang }),
  ).data;
  const { data } = useSuspenseQuery(
    publicPostsQuery({
      school,
      locale: site.locale,
      category: search.category,
      page: search.page,
    }),
  );
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{m.siteBlog()}</h1>
      {data.categories.length > 0 ? (
        <nav aria-label={m.siteCategories()} className="flex flex-wrap gap-2">
          <Link
            to="/site/$school/blog"
            params={{ school }}
            search={{ lang: site.locale, category: "", page: 1 }}
            aria-current={search.category === "" ? "true" : undefined}
            className={chip}
          >
            {m.siteAllPosts()}
          </Link>
          {data.categories.map((category) => (
            <Link
              key={category.slug}
              to="/site/$school/blog"
              params={{ school }}
              search={{ lang: site.locale, category: category.slug, page: 1 }}
              aria-current={
                search.category === category.slug ? "true" : undefined
              }
              className={chip}
            >
              {category.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <PostList posts={data.rows} school={school} locale={site.locale} />
      {data.pages > 1 ? (
        <nav
          aria-label={m.sitePagination()}
          className="flex items-center justify-between gap-3"
        >
          <ButtonLink
            variant="outline"
            size="sm"
            to="/site/$school/blog"
            params={{ school }}
            search={{
              lang: site.locale,
              category: search.category,
              page: Math.max(1, data.page - 1),
            }}
            className={cn(data.page <= 1 && "pointer-events-none opacity-50")}
            aria-disabled={data.page <= 1 || undefined}
          >
            {m.tablePreviousPage()}
          </ButtonLink>
          <p className="text-sm text-muted-foreground">
            {m.tablePageOf({
              page: formatNumber(data.page),
              pageCount: formatNumber(data.pages),
            })}
          </p>
          <ButtonLink
            variant="outline"
            size="sm"
            to="/site/$school/blog"
            params={{ school }}
            search={{
              lang: site.locale,
              category: search.category,
              page: Math.min(data.pages, data.page + 1),
            }}
            className={cn(
              data.page >= data.pages && "pointer-events-none opacity-50",
            )}
            aria-disabled={data.page >= data.pages || undefined}
          >
            {m.tableNextPage()}
          </ButtonLink>
        </nav>
      ) : null}
    </div>
  );
}
