import { sitePostsQuerySchema } from "@faridalms/domain/site";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import * as v from "valibot";

import { PageHeader } from "~/components/app/primitives";
import { SiteCategoriesPanel } from "~/components/site/SiteCategoriesPanel";
import { SitePagesPanel } from "~/components/site/SitePagesPanel";
import { SitePostsPanel } from "~/components/site/SitePostsPanel";
import { SiteSettingsForm } from "~/components/site/SiteSettingsForm";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import * as m from "~/i18n/messages";
import {
  siteCategoriesQuery,
  sitePagesQuery,
  sitePostsQuery,
  siteSettingsQuery,
} from "~/queries/site";

const TABS = ["settings", "pages", "posts", "categories"] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: string): value is Tab =>
  TABS.some((tab) => tab === value);

export const Route = createFileRoute("/_app/admin/site")({
  staticData: { breadcrumb: m.siteTitle },
  validateSearch: v.object({
    tab: v.optional(v.picklist(TABS), "settings"),
    ...sitePostsQuerySchema.entries,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(siteSettingsQuery);
    if (deps.tab === "pages")
      await context.queryClient.ensureQueryData(sitePagesQuery);
    if (deps.tab === "posts")
      await context.queryClient.ensureQueryData(
        sitePostsQuery({ page: deps.page, status: deps.status }),
      );
    if (deps.tab === "categories")
      await context.queryClient.ensureQueryData(siteCategoriesQuery);
  },
  component: SiteAdminPage,
});
function SiteAdminPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(siteSettingsQuery);
  const patch = (change: Partial<typeof search>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  return (
    <>
      <PageHeader title={m.siteTitle()} description={m.siteHint()} />
      <Tabs
        value={search.tab}
        onValueChange={(tab) => {
          if (isTab(tab)) patch({ tab });
        }}
        className="gap-6"
      >
        <TabsList>
          <TabsTrigger value="settings">{m.siteTabSettings()}</TabsTrigger>
          <TabsTrigger value="pages">{m.siteTabPages()}</TabsTrigger>
          <TabsTrigger value="posts">{m.siteTabPosts()}</TabsTrigger>
          <TabsTrigger value="categories">{m.siteTabCategories()}</TabsTrigger>
        </TabsList>
        <TabsContent value="settings">
          <SiteSettingsForm key={data.settings.revision} data={data} />
        </TabsContent>
        <TabsContent value="pages">
          {search.tab === "pages" ? (
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <SitePagesPanel />
            </Suspense>
          ) : null}
        </TabsContent>
        <TabsContent value="posts">
          {search.tab === "posts" ? (
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <SitePostsPanel
                query={{ page: search.page, status: search.status }}
                onQuery={(next) => patch(next)}
              />
            </Suspense>
          ) : null}
        </TabsContent>
        <TabsContent value="categories">
          {search.tab === "categories" ? (
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <SiteCategoriesPanel />
            </Suspense>
          ) : null}
        </TabsContent>
      </Tabs>
    </>
  );
}
