import type { SiteLocale } from "@faridalms/domain/website";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { SITE_LOCALES } from "@faridalms/domain/website";
import { ErrorPage, NotFoundPage } from "@faridalms/ui/system/status-page";
import { useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  isNotFound,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import * as v from "valibot";

import type { PublicSite } from "~/components/site/SiteShell";

import { SiteStatus } from "~/components/site/PublicPage";
import { SiteNotOpen } from "~/components/site/SiteNotOpen";
import { getLocale } from "~/i18n/runtime";
import { portalFaceQuery } from "~/queries/portal";
import { publicSiteQuery } from "~/queries/site";
import siteCss from "~/styles/site.css?url";
import { adoptSchoolZone } from "~/utils/datetime";
import { adoptDigits } from "~/utils/digits";

/** A school's public website. No one signs in here; the address names the school. */
export const Route = createFileRoute("/site/$school")({
  staticData: { schoolFace: true },
  validateSearch: v.object({
    lang: v.fallback(v.optional(v.picklist(SITE_LOCALES)), undefined),
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ context, params, deps }) => {
    try {
      return await context.queryClient.ensureQueryData(
        publicSiteQuery(params.school, deps.lang),
      );
    } catch (error) {
      if (!isNotFound(error)) throw error;
      // A school whose website is not open still has its portal's face.
      await context.queryClient.ensureQueryData(portalFaceQuery(params.school));
      throw error;
    }
  },
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

const faceLocale = (lang: SiteLocale | undefined) =>
  lang ?? (getLocale() === "ar" ? "ar" : "en");

function SiteMissing() {
  const { school } = Route.useParams();
  const { lang } = Route.useSearch();
  const site = useKnownSite();
  const face = useQueryClient().getQueryData(portalFaceQuery(school).queryKey);
  if (site) return <KnownSite site={site} school={school} kind="missing" />;
  return face ? (
    <SiteNotOpen face={face} locale={faceLocale(lang)} />
  ) : (
    <NotFoundPage />
  );
}

function SiteFailed(props: ErrorComponentProps) {
  const { school } = Route.useParams();
  const site = useKnownSite();
  const router = useRouter();
  if (!site) return <ErrorPage {...props} />;
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

interface KnownSiteProps {
  site: PublicSite;
  school: string;
  kind: "missing" | "failed";
  onRetry?: () => void;
}

function KnownSite({ site, ...rest }: KnownSiteProps) {
  adoptSchool(site);
  return <SiteStatus site={site} {...rest} />;
}
