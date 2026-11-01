import type { ContentDocument } from "@faridalms/domain/content";
import type { Theme } from "@faridalms/domain/site-theme";
import type { SiteLocale } from "@faridalms/domain/website";

import {
  publicationsOf,
  publicSchool,
  publishedSignIn,
  siteSettings,
} from "@faridalms/database/stores/site";
import {
  resolveTheme,
  siteChromeSchema,
  siteThemeSchema,
} from "@faridalms/domain/site-theme";
import * as v from "valibot";

import type { RequestContext } from "./context";

import { withPublicSite } from "./site";

export interface PortalFace {
  school: string;
  name: { en: string | null; ar: string | null };
  /** Null while the school has never styled its website: the portal keeps the platform's look. */
  theme: Theme | null;
  logoKey: string | null;
  /** The sign-in page as published, in the language asked when it has one; null for the default. */
  page: {
    body: ContentDocument;
    locale: SiteLocale;
    media: Record<string, string>;
  } | null;
}

const TTL_MS = 60_000;
// Keys are school codes that exist, so this stays small, but it is bounded
// all the same.
const MAX_CACHED = 2_000;
const cache = new Map<string, { at: number; value: PortalFace }>();

/** Drops a school's cached face once what it shows has changed. */
export function forgetFace(slug: string) {
  cache.delete(`${slug}:en`);
  cache.delete(`${slug}:ar`);
}

/**
 * What a stranger sees of a school before signing in: its names, logo,
 * theme and the sign-in page's published words. Read as the site role,
 * which reaches nothing unpublished, and kept for a minute.
 */
export async function portalFace(
  context: RequestContext,
  slug: string,
  locale: SiteLocale,
): Promise<PortalFace> {
  const key = `${slug}:${locale}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await withPublicSite(
    context,
    slug,
    async ({ tx, tenantId, schoolId }) => {
      const [school, settings, pages] = await Promise.all([
        publicSchool(tx, schoolId),
        siteSettings(tx, tenantId, schoolId),
        publishedSignIn(tx, schoolId),
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
      const page =
        pages.find((row) => row.locale === locale) ??
        pages.find((row) => row.locale === settings?.primaryLocale) ??
        pages[0];
      const content = page?.content as
        | { body?: ContentDocument; locale?: SiteLocale }
        | undefined;
      return {
        school: slug,
        name: { en: school?.nameEn ?? null, ar: school?.nameAr ?? null },
        theme: settings
          ? resolveTheme(theme.success ? theme.output : null)
          : null,
        logoKey: logo?.publicKey ?? null,
        page:
          page && content?.body
            ? {
                body: content.body,
                locale: content.locale ?? page.locale,
                media: page.media,
              }
            : null,
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
