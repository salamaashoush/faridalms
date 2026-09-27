import { POST_TABS } from "@faridalms/domain/website";
import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  redirect,
  stripSearchParams,
} from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import * as v from "valibot";

import { SiteCategories } from "~/components/site/SiteCategories";
import { SitePages } from "~/components/site/SitePages";
import { SitePosts } from "~/components/site/SitePosts";
import { SiteSettings } from "~/components/site/SiteSettings";
import { PageHeader } from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { siteOverviewQuery, sitePostsQuery } from "~/queries/site";
import { currentUserQuery } from "~/queries/user";
import siteCss from "~/styles/site.css?url";

const TABS = ["pages", "posts", "categories", "settings"] as const;

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS), "pages"), "pages"),
  posts: v.fallback(
    v.optional(v.picklist(POST_TABS), "published"),
    "published",
  ),
  q: v.fallback(v.optional(v.pipe(v.string(), v.maxLength(100)), ""), ""),
});
type Search = v.InferOutput<typeof searchSchema>;
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/admin/site")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("site:manage"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await Promise.all([
      context.queryClient.ensureQueryData(siteOverviewQuery),
      deps.tab === "posts"
        ? context.queryClient.ensureQueryData(
            sitePostsQuery({ tab: deps.posts, q: deps.q }),
          )
        : null,
    ]);
  },
  head: () => ({ links: [{ rel: "stylesheet", href: siteCss }] }),
  component: WebsitePage,
});

const TAB_LABEL: Record<(typeof TABS)[number], () => string> = {
  pages: m.siteTabPages,
  posts: m.siteTabPosts,
  categories: m.siteTabCategories,
  settings: m.siteTabSettings,
};

function WebsitePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const overview = useSuspenseQuery(siteOverviewQuery).data;
  const patch = (change: Partial<Search>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  return (
    <>
      <PageHeader
        title={m.siteTitle()}
        description={m.siteHint()}
        action={
          overview.settings.live
            ? {
                label: m.siteView(),
                icon: ExternalLink,
                link: {
                  to: "/site/$school",
                  params: { school: user.school.slug },
                },
              }
            : undefined
        }
      />
      <RecordTabs
        label={m.siteSections()}
        tabs={TABS.map((value) => ({ value, label: TAB_LABEL[value]() }))}
        value={search.tab}
        onChange={(tab) => patch({ tab })}
      >
        {search.tab === "pages" ? (
          <SitePages overview={overview} />
        ) : search.tab === "posts" ? (
          <SitePosts
            search={{ tab: search.posts, q: search.q }}
            onSearch={(change) =>
              patch({
                ...(change.tab ? { posts: change.tab } : {}),
                ...(change.q === undefined ? {} : { q: change.q }),
              })
            }
          />
        ) : search.tab === "categories" ? (
          <SiteCategories categories={overview.categories} />
        ) : (
          <SiteSettings
            key={overview.settings.version}
            settings={overview.settings}
          />
        )}
      </RecordTabs>
    </>
  );
}
