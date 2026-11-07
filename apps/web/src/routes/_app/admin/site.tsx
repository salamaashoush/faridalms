import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import * as v from "valibot";

import { SiteAddresses } from "~/components/site/SiteAddresses";
import { SiteCategories } from "~/components/site/SiteCategories";
import { SitePages } from "~/components/site/SitePages";
import { SiteRedirects } from "~/components/site/SiteRedirects";
import { SiteSettings } from "~/components/site/SiteSettings";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  siteHostsQuery,
  siteOverviewQuery,
  siteRedirectsQuery,
} from "~/queries/site";
import { currentUserQuery } from "~/queries/user";
import siteCss from "~/styles/site.css?url";
import { requirePage } from "~/utils/page-access";

const TABS = [
  "pages",
  "categories",
  "settings",
  "addresses",
  "redirects",
] as const;

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS), "pages"), "pages"),
});
type Search = v.InferOutput<typeof searchSchema>;
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/admin/site")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "site:manage");
    await Promise.all([
      context.queryClient.ensureQueryData(siteOverviewQuery),
      deps.tab === "addresses"
        ? context.queryClient.ensureQueryData(siteHostsQuery)
        : null,
      deps.tab === "redirects"
        ? context.queryClient.ensureQueryData(siteRedirectsQuery)
        : null,
    ]);
  },
  head: () => ({ links: [{ rel: "stylesheet", href: siteCss }] }),
  component: WebsitePage,
});

const TAB_LABEL: Record<(typeof TABS)[number], () => string> = {
  pages: m.siteTabPages,
  categories: m.siteTabCategories,
  settings: m.siteTabSettings,
  addresses: m.siteTabAddresses,
  redirects: m.siteTabRedirects,
};

function WebsitePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const overview = useSuspenseQuery(siteOverviewQuery).data;
  const patch = (change: Partial<Search>) => {
    void navigate({
      resetScroll: false,
      search: (previous) => ({ ...previous, ...change }),
    });
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
        ) : search.tab === "categories" ? (
          <SiteCategories categories={overview.categories} />
        ) : search.tab === "addresses" ? (
          <SiteAddresses />
        ) : search.tab === "redirects" ? (
          <SiteRedirects pages={overview.pages} />
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
