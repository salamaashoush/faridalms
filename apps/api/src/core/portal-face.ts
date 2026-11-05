import type { PostalAddress } from "@faridalms/database/tables/tenancy";
import type { Palette } from "@faridalms/domain/site-theme";

import { publicSchool, siteSettings } from "@faridalms/database/stores/site";
import { platformName } from "@faridalms/domain/hosts";
import { resolveTheme, siteThemeSchema } from "@faridalms/domain/site-theme";
import * as v from "valibot";

import type { RequestContext } from "./context";

import { logoKey, withPublicSite } from "./site";

/**
 * What a school's portal shows of the school before anyone signs in. The
 * portal's pages are the app's own, in its design system; this is only what
 * makes them the school's: its names, its logo, its colour and the way back
 * to its website.
 */
export interface PortalFace {
  school: string;
  name: { en: string | null; ar: string | null };
  /** The school's colours, whose main colour the portal takes as its accent; null keeps the platform's. */
  palette: Palette | null;
  logoKey: string | null;
  contact: {
    address: PostalAddress | null;
    phone: string | null;
    email: string | null;
  };
  /** Where the school's website answers while it is live; null while it is not. */
  websiteHost: string | null;
  /** The public key a form renders Turnstile with; null where it is not set up. */
  turnstileKey: string | null;
  /** The school's portal is suspended: its page says so, and nobody signs in. */
  paused: boolean;
}

const TTL_MS = 60_000;
// Keys are school codes that exist, so this stays small, but it is bounded
// all the same.
const MAX_CACHED = 2_000;
const cache = new Map<string, { at: number; value: PortalFace }>();

/** Drops a school's cached face once what it shows has changed. */
export function forgetFace(slug: string) {
  cache.delete(slug);
}

/**
 * The face of a school's portal: read as the site role, which reaches only
 * what the school already shows strangers, and kept for a minute so drawing
 * a sign-in page does not reach the cell each time.
 */
export async function portalFace(
  context: RequestContext,
  slug: string,
): Promise<PortalFace> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const directory = await context.directory.bySlug(slug);
  // A suspended tenant answers nothing from its cell; its own portal says
  // it is paused with only the names the directory already shows.
  if (directory?.tenantState === "suspended")
    return {
      school: slug,
      name: { en: directory.nameEn, ar: directory.nameAr },
      palette: null,
      logoKey: null,
      contact: { address: null, phone: null, email: null },
      websiteHost: null,
      turnstileKey: null,
      paused: true,
    };
  const value = await withPublicSite(
    context,
    slug,
    async ({ tx, tenantId, schoolId }) => {
      const [school, settings] = await Promise.all([
        publicSchool(tx, schoolId),
        siteSettings(tx, tenantId, schoolId),
      ]);
      const theme = v.safeParse(siteThemeSchema, settings?.theme ?? {});
      const logo = school
        ? await logoKey(tx, tenantId, {
            id: schoolId,
            logoFileId: school.logoFileId,
          })
        : null;
      return {
        school: slug,
        name: { en: school?.nameEn ?? null, ar: school?.nameAr ?? null },
        palette: settings
          ? resolveTheme(theme.success ? theme.output : null).palette
          : null,
        logoKey: logo,
        contact: {
          address: school?.address ?? null,
          phone: school?.phone ?? null,
          email: school?.email ?? null,
        },
        websiteHost: settings?.live
          ? (directory?.hosts.site ??
            platformName(slug, "site", context.domains))
          : null,
        turnstileKey: context.turnstile?.siteKey ?? null,
        paused: false,
      };
    },
  );
  cache.delete(slug);
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(slug, { at: Date.now(), value });
  return value;
}
