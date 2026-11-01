import type { SiteLocale } from "@faridalms/domain/website";
import type { ReactNode } from "react";

import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import type { publicSiteQuery } from "~/queries/site";

import * as m from "~/i18n/messages";
import { hostHref, insideWebsite, publicPath } from "~/utils/host";

import type { SiteFrameModel } from "./render/frame";
import type { NewsItem, RenderContext, SiteEvent } from "./render/parts";

import { SiteFrame } from "./render/frame";
import { publicMediaUrl } from "./render/parts";

export type PublicSite = Awaited<
  ReturnType<NonNullable<ReturnType<typeof publicSiteQuery>["queryFn"]>>
>;

/** The search a site link carries: the language, unless it is the site's first. */
export function langSearch(site: {
  locale: SiteLocale;
  primaryLocale: SiteLocale;
}) {
  return site.locale === site.primaryLocale ? {} : { lang: site.locale };
}

const langQuery = (site: PublicSite) =>
  site.locale === site.primaryLocale ? "" : `?lang=${site.locale}`;

export function publicContext(
  site: PublicSite,
  school: string,
  input: {
    media?: Record<string, string>;
    news?: NewsItem[];
    events?: SiteEvent[];
    page?: string;
  } = {},
): RenderContext {
  return {
    school,
    locale: site.locale,
    theme: site.theme,
    fileUrl: (fileId) => {
      const key = input.media?.[fileId];
      return key ? publicMediaUrl(key) : null;
    },
    news: input.news ?? [],
    events: input.events ?? [],
    contact: site.contact,
    query: langQuery(site),
    page: input.page,
  };
}

function frameOf(
  site: PublicSite,
  school: string,
  pathname: string,
): SiteFrameModel {
  const base = `/site/${school}`;
  const current = pathname.startsWith(base)
    ? pathname.slice(base.length) || "/"
    : "/";
  const other = site.locales.find((locale) => locale !== site.locale);
  return {
    name: site.name,
    tagline: site.tagline,
    logoUrl: site.logoKey ? publicMediaUrl(site.logoKey) : null,
    banner: site.banner,
    utility: site.utility,
    actions: site.actions,
    menu: [
      ...site.menu.map((entry) => ({
        id: entry.pageId,
        parentId: entry.parentId,
        label: entry.title,
        href: entry.isHome ? "/" : `/pages/${entry.slug}`,
      })),
      ...([...site.utility, ...site.actions].some(
        (link) => link.href === "/news",
      )
        ? []
        : [
            {
              id: "news",
              parentId: null,
              label: m.siteNews({}, { locale: site.locale }),
              href: "/news",
            },
          ]),
    ],
    footerColumns: site.footerColumns,
    footerNote: site.footerNote,
    dock: site.dock,
    socialLinks: site.socialLinks,
    otherLanguage: other
      ? {
          locale: other,
          href: `${publicPath(pathname, school)}${other === site.primaryLocale ? "" : `?lang=${other}`}`,
        }
      : null,
    currentHref: current.startsWith("/news") ? "/news" : current,
    signInHref: hostHref(site.portalHost, "/sign-in"),
  };
}

/**
 * A school's public website around one of its pages. Links inside the site
 * move through the router, so a visitor does not reload the whole site to
 * turn a page.
 */
export function SiteShell({
  site,
  school,
  overlay = false,
  media,
  children,
}: {
  site: PublicSite;
  school: string;
  overlay?: boolean;
  media?: Record<string, string>;
  children: ReactNode;
}) {
  const router = useRouter();
  const location = useLocation();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const follow = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as HTMLElement).closest("a");
      const href = anchor?.getAttribute("href");
      if (
        !anchor ||
        !href ||
        !insideWebsite(href, school) ||
        anchor.target ||
        anchor.hasAttribute("hreflang")
      )
        return;
      event.preventDefault();
      void router.navigate({ href });
    };
    element.addEventListener("click", follow);
    return () => element.removeEventListener("click", follow);
  }, [router, school]);
  return (
    <div ref={root} className="min-h-dvh">
      <SiteFrame
        frame={frameOf(site, school, location.pathname)}
        context={publicContext(site, school, { media })}
        overlay={overlay}
      >
        {children}
      </SiteFrame>
    </div>
  );
}
