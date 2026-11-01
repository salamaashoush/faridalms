import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  redirect,
  stripSearchParams,
} from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import * as v from "valibot";

import { SiteAddresses } from "~/components/site/SiteAddresses";
import { SiteCategories } from "~/components/site/SiteCategories";
import { SiteEnquiries } from "~/components/site/SiteEnquiries";
import { SitePages } from "~/components/site/SitePages";
import { SiteSettings } from "~/components/site/SiteSettings";
import { PageHeader } from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  siteEnquiriesQuery,
  siteHostsQuery,
  siteOverviewQuery,
} from "~/queries/site";
import { currentUserQuery } from "~/queries/user";
import siteCss from "~/styles/site.css?url";

const TABS = [
  "pages",
  "enquiries",
  "categories",
  "settings",
  "addresses",
] as const;

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS), "pages"), "pages"),
  handled: v.fallback(v.optional(v.boolean(), false), false),
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
      deps.tab === "enquiries"
        ? context.queryClient.ensureQueryData(siteEnquiriesQuery(deps.handled))
        : null,
      deps.tab === "addresses"
        ? context.queryClient.ensureQueryData(siteHostsQuery)
        : null,
    ]);
  },
  head: () => ({ links: [{ rel: "stylesheet", href: siteCss }] }),
  component: WebsitePage,
});

const TAB_LABEL: Record<(typeof TABS)[number], () => string> = {
  pages: m.siteTabPages,
  enquiries: m.siteTabEnquiries,
  categories: m.siteTabCategories,
  settings: m.siteTabSettings,
  addresses: m.siteTabAddresses,
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
        ) : search.tab === "enquiries" ? (
          <SiteEnquiries
            handled={search.handled}
            onHandled={(handled) => patch({ handled })}
          />
        ) : search.tab === "categories" ? (
          <SiteCategories categories={overview.categories} />
        ) : search.tab === "addresses" ? (
          <SiteAddresses />
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
