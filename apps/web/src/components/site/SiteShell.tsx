import type { PublishedPicture } from "@faridalms/domain/previews";
import type { SiteLocale } from "@faridalms/domain/website";
import type { PictureSources } from "@faridalms/editor/file-facts";
import type { ReactNode } from "react";

import { publishedSources } from "@faridalms/domain/previews";
import { PictureSourcesProvider } from "@faridalms/editor/file-facts";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import type { publicSiteQuery } from "~/queries/site";

import * as m from "~/i18n/messages";
import { hostHref, insideWebsite, publicPath } from "~/utils/host";

import type { SiteFrameModel } from "./render/frame";
import type {
  NewsItem,
  RenderContext,
  SiteEvent,
  SiteIntake,
} from "./render/parts";

import { SiteFrame } from "./render/frame";
import { withNews } from "./render/frame-model";
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
    intakes?: SiteIntake[];
    today?: string;
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
    intakes: input.intakes ?? [],
    today: input.today,
    applyHref: (intakeId) =>
      hostHref(
        site.portalHost,
        intakeId ? `/apply?intake=${intakeId}` : "/apply",
      ),
    contact: site.contact,
    query: langQuery(site),
    page: input.page,
    turnstileKey: site.turnstileKey,
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
    menu: withNews(
      site.menu.map((entry) => ({
        id: entry.pageId,
        parentId: entry.parentId,
        label: entry.title,
        href: entry.isHome ? "/" : `/pages/${entry.slug}`,
      })),
      [...site.utility, ...site.actions],
      m.siteNews({}, { locale: site.locale }),
    ),
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
 * Where a published page's pictures are fetched at each size: the sizes
 * published beside each one, in the public folder its copy sits in.
 */
export function publicPictureSources(
  media: Record<string, string>,
  pictures: Record<string, PublishedPicture>,
): PictureSources {
  return (fileId) => {
    const key = media[fileId];
    const picture = pictures[fileId];
    if (!key || !picture) return undefined;
    return {
      sources: publishedSources(publicMediaUrl(key), picture),
      width: picture.width,
      height: picture.height,
      ...(picture.placeholder ? { placeholder: picture.placeholder } : {}),
      ...(picture.focus ? { focus: picture.focus } : {}),
    };
  };
}

export interface SiteShellProps {
  site: PublicSite;
  school: string;
  overlay?: boolean;
  media?: Record<string, string>;
  /** What the page published of its pictures, for their sizes and placeholders. */
  pictures?: Record<string, PublishedPicture>;
  children: ReactNode;
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
  pictures,
  children,
}: SiteShellProps) {
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
    <PictureSourcesProvider
      value={publicPictureSources(media ?? {}, pictures ?? {})}
    >
      <div ref={root} className="min-h-dvh">
        <SiteFrame
          frame={frameOf(site, school, location.pathname)}
          context={publicContext(site, school, { media })}
          overlay={overlay}
        >
          {children}
        </SiteFrame>
      </div>
    </PictureSourcesProvider>
  );
}
