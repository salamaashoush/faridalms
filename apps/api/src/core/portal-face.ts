import type { PostalAddress } from "@faridalms/database/tables/tenancy";
import type { PortalDoor } from "@faridalms/domain/site-sections";
import type { Theme } from "@faridalms/domain/site-theme";
import type {
  PageSection,
  SiteLocale,
  SocialLink,
} from "@faridalms/domain/website";

import {
  publicationsOf,
  publicMenu,
  publicPortalPages,
  publicSchool,
  siteSettings,
} from "@faridalms/database/stores/site";
import { platformName } from "@faridalms/domain/hosts";
import { buildTemplate, PORTAL_PAGES } from "@faridalms/domain/site-templates";
import {
  resolveTheme,
  siteChromeSchema,
  siteThemeSchema,
} from "@faridalms/domain/site-theme";
import { pageSectionSchema } from "@faridalms/domain/website";
import * as v from "valibot";

import type { RequestContext } from "./context";

import { withPublicSite } from "./site";

interface FaceLink {
  id: string;
  label: string;
  href: string;
}

/** The website's frame around the portal page, while the website is live. */
export interface FaceFrame {
  /** Where the website answers; the frame's own links lead there. */
  siteHost: string;
  tagline: string;
  utility: FaceLink[];
  actions: (FaceLink & { style: "primary" | "secondary" })[];
  menu: {
    id: string;
    parentId: string | null;
    label: string;
    href: string;
  }[];
  footerColumns: { id: string; title: string; links: FaceLink[] }[];
  footerNote: string;
  socialLinks: SocialLink[];
}

export interface PortalFace {
  school: string;
  name: { en: string | null; ar: string | null };
  /** Null while the school has never styled its website: the portal keeps the platform's look. */
  theme: Theme | null;
  logoKey: string | null;
  contact: {
    address: PostalAddress | null;
    phone: string | null;
    email: string | null;
  };
  frame: FaceFrame | null;
  /**
   * The portal page of the school's site as published, in the language
   * asked when it has one, or the builder's starter page until the school
   * publishes its own. Each section says the language it is shown in.
   */
  page: {
    locale: SiteLocale;
    title: string;
    sections: { section: PageSection; locale: SiteLocale }[];
    media: Record<string, string>;
    starter: boolean;
  };
  /** The public key a form on the page renders Turnstile with; null where it is not set up. */
  turnstileKey: string | null;
}

const TTL_MS = 60_000;
// Keys are school codes that exist, so this stays small, but it is bounded
// all the same.
const MAX_CACHED = 2_000;
const cache = new Map<string, { at: number; value: PortalFace }>();

/** Drops a school's cached faces, every door in both languages, once what they show has changed. */
export function forgetFace(slug: string) {
  for (const key of cache.keys())
    if (key.startsWith(`${slug}:`)) cache.delete(key);
}

/** Published sections read through the schema, so later fields get their defaults. */
function shownSections(content: Record<string, unknown>) {
  const listed = Array.isArray(content.sections) ? content.sections : [];
  return listed.flatMap((item: unknown) => {
    const shown = item as { section?: unknown; locale?: unknown };
    const read = v.safeParse(pageSectionSchema, shown.section);
    const locale: SiteLocale = shown.locale === "ar" ? "ar" : "en";
    return read.success ? [{ section: read.output, locale }] : [];
  });
}

function starterPage(door: PortalDoor, locale: SiteLocale): PortalFace["page"] {
  const starter = PORTAL_PAGES[door];
  const built = buildTemplate(starter.template, locale);
  return {
    locale,
    title: locale === "ar" ? starter.title[1] : starter.title[0],
    sections: built.content.map((section) => ({ section, locale })),
    media: {},
    starter: true,
  };
}

/**
 * What a stranger sees of a school before signing in: its names, logo,
 * theme, its website's frame while the website is live, and the portal
 * page of its site. Read as the site role, which reaches nothing
 * unpublished, and kept for a minute.
 */
export async function portalFace(
  context: RequestContext,
  slug: string,
  locale: SiteLocale,
  door: PortalDoor = "sign-in",
): Promise<PortalFace> {
  const key = `${slug}:${door}:${locale}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const directory = await context.directory.bySlug(slug);
  const value = await withPublicSite(
    context,
    slug,
    async ({ tx, tenantId, schoolId }) => {
      const [school, settings, pages] = await Promise.all([
        publicSchool(tx, schoolId),
        siteSettings(tx, tenantId, schoolId),
        publicPortalPages(tx, schoolId, door),
      ]);
      const chrome = v.safeParse(siteChromeSchema, settings?.chrome ?? {});
      const theme = v.safeParse(siteThemeSchema, settings?.theme ?? {});
      const logoFileId = chrome.success ? chrome.output.logoFileId : null;
      const logo =
        settings && logoFileId
          ? (
              await publicationsOf(tx, {
                tenantId,
                hostType: "site_settings",
                hostId: settings.id,
              })
            ).find((row) => row.fileId === logoFileId)
          : undefined;
      const published =
        pages.find((row) => row.locale === locale) ??
        pages.find((row) => row.locale === settings?.primaryLocale) ??
        pages[0];
      const say = (words: { en: string; ar: string }) =>
        words[locale] || words[settings?.primaryLocale ?? "en"];
      const frame: FaceFrame | null =
        settings?.live && chrome.success
          ? {
              siteHost:
                directory?.hosts.site ??
                platformName(slug, "site", context.domains),
              tagline:
                (locale === "ar" ? settings.taglineAr : settings.taglineEn) ||
                (settings.primaryLocale === "ar"
                  ? settings.taglineAr
                  : settings.taglineEn),
              utility: chrome.output.utility.map((item) => ({
                id: item.id,
                label: say(item.label),
                href: item.href,
              })),
              actions: chrome.output.actions.map((item) => ({
                id: item.id,
                label: say(item.label),
                href: item.href,
                style: item.style,
              })),
              menu: (await publicMenu(tx, { orgId: schoolId, locale })).map(
                (entry) => ({
                  id: entry.pageId,
                  parentId: entry.parentId,
                  label: entry.title,
                  href: entry.isHome ? "/" : `/pages/${entry.slug}`,
                }),
              ),
              footerColumns: chrome.output.footerColumns.map((column) => ({
                id: column.id,
                title: say(column.title),
                links: column.links.map((item) => ({
                  id: item.id,
                  label: say(item.label),
                  href: item.href,
                })),
              })),
              footerNote: say(chrome.output.footerNote),
              socialLinks: settings.socialLinks,
            }
          : null;
      return {
        school: slug,
        name: { en: school?.nameEn ?? null, ar: school?.nameAr ?? null },
        theme: settings
          ? resolveTheme(theme.success ? theme.output : null)
          : null,
        logoKey: logo?.publicKey ?? null,
        contact: {
          address: school?.address ?? null,
          phone: school?.phone ?? null,
          email: school?.email ?? null,
        },
        frame,
        page: published
          ? {
              locale: published.locale,
              title: published.title,
              sections: shownSections(published.content),
              media: published.media,
              starter: false,
            }
          : starterPage(door, locale),
        turnstileKey: context.turnstile?.siteKey ?? null,
      };
    },
  );
  cache.delete(key);
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}
