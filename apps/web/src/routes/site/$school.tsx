import type { ErrorComponentProps } from "@tanstack/react-router";

import { SITE_LOCALES } from "@faridalms/domain/website";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import * as v from "valibot";

import type { PublicSite } from "~/components/site/SiteShell";

import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import { SiteStatus } from "~/components/site/PublicPage";
import { publicSiteQuery } from "~/queries/site";
import siteCss from "~/styles/site.css?url";
import { adoptSchoolZone } from "~/utils/datetime";
import { adoptDigits } from "~/utils/digits";

/** A school's public website. No one signs in here; the address names the school. */
export const Route = createFileRoute("/site/$school")({
  validateSearch: v.object({
    lang: v.fallback(v.optional(v.picklist(SITE_LOCALES)), undefined),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      publicSiteQuery(params.school, deps.lang),
    ),
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.name }] : [],
    links: [{ rel: "stylesheet", href: siteCss }],
  }),
  component: SiteFrame,
  notFoundComponent: SiteMissing,
  errorComponent: SiteFailed,
});

/**
 * Its visitors carry no school of their own, so the website counts in its
 * school's digits and keeps its school's clock from the first word drawn.
 */
function adoptSchool(site: PublicSite) {
  adoptDigits(site.digits);
  adoptSchoolZone(site.timeZone);
}

function SiteFrame() {
  const site = Route.useLoaderData();
  adoptSchool(site);
  return <Outlet />;
}

/** The website as it is already known, when the address inside it fails. */
function useKnownSite(): PublicSite | undefined {
  const { school } = Route.useParams();
  const { lang } = Route.useSearch();
  return useQueryClient().getQueryData(publicSiteQuery(school, lang).queryKey);
}

function SiteMissing() {
  const { school } = Route.useParams();
  const site = useKnownSite();
  if (!site) return <NotFound />;
  return <KnownSite site={site} school={school} kind="missing" />;
}

function SiteFailed(props: ErrorComponentProps) {
  const { school } = Route.useParams();
  const site = useKnownSite();
  const router = useRouter();
  if (!site) return <DefaultCatchBoundary {...props} />;
  return (
    <KnownSite
      site={site}
      school={school}
      kind="failed"
      onRetry={() => {
        props.reset();
        void router.invalidate();
      }}
    />
  );
}

function KnownSite({
  site,
  ...rest
}: {
  site: PublicSite;
  school: string;
  kind: "missing" | "failed";
  onRetry?: () => void;
}) {
  adoptSchool(site);
  return <SiteStatus site={site} {...rest} />;
}
