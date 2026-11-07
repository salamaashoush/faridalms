import type { SiteLocale } from "./site-sections";

import { isSafeContentUrl } from "./content";

/** A page's path on the school's website host. */
export const sitePagePath = (page: { isHome: boolean; slug: string }) =>
  page.isHome ? "/" : `/pages/${page.slug}`;

export const sitePostPath = (slug: string) => `/news/${slug}`;

/**
 * A website path in one language. The site's first language answers at the
 * path itself, so that address stays the one people already share; the
 * other carries `?lang=`.
 */
export function localePath(
  path: string,
  locale: SiteLocale,
  primary: SiteLocale,
): string {
  return locale === primary ? path : `${path}?lang=${locale}`;
}

export interface Alternate {
  hreflang: SiteLocale | "x-default";
  path: string;
}

/**
 * The languages a page is published in, as search engines are told: each
 * one, and `x-default` at the first language's address. A page in one
 * language has no alternates.
 */
export function alternatesOf(
  path: string,
  locales: readonly SiteLocale[],
  primary: SiteLocale,
): Alternate[] {
  const shown = [...new Set(locales)];
  const fallback = shown.includes(primary) ? primary : shown[0];
  if (shown.length < 2 || !fallback) return [];
  return [
    ...shown.map((locale) => ({
      hreflang: locale,
      path: localePath(path, locale, primary),
    })),
    { hreflang: "x-default", path: localePath(path, fallback, primary) },
  ];
}

const blankOrControl = (value: string) =>
  /\s/.test(value) ||
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

/**
 * An address a page may point to: a path on the school's own site, or a
 * web address elsewhere.
 */
export function isPageAddress(value: string): boolean {
  if (value.length > 2048) return false;
  if (value.startsWith("/"))
    return !value.startsWith("//") && !blankOrControl(value);
  return /^https?:\/\//i.test(value) && isSafeContentUrl(value);
}

/**
 * An old address as a redirect matches it: the path alone, decoded,
 * lower-cased and without a trailing slash, so `/About-Us/` and
 * `/about-us?ref=x` are one address. Null for anything that is not a path.
 */
export function redirectPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const path = trimmed.split(/[?#]/, 1)[0] ?? "";
  let decoded = path;
  try {
    decoded = decodeURI(path);
  } catch {
    // A malformed escape is matched as it was written.
  }
  if (blankOrControl(decoded)) return null;
  const bare = decoded.toLowerCase().replace(/\/+$/, "");
  return bare === "" ? "/" : bare;
}

/** The longest old address a school may map. */
export const MAX_REDIRECT_PATH = 300;

/** Whether an old address can be redirected: any path but the home page's. */
export function isRedirectFrom(path: string): boolean {
  const normal = redirectPath(path);
  return (
    normal !== null && normal !== "/" && normal.length <= MAX_REDIRECT_PATH
  );
}

const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);
// First path segments of X addresses that are not an account.
const X_PAGES = new Set([
  "home",
  "i",
  "intent",
  "share",
  "search",
  "hashtag",
  "explore",
  "messages",
  "notifications",
  "settings",
]);

/**
 * The school's account on X, read from its link there, for the card a
 * shared page shows. Null when it links none, or a link that names no
 * account.
 */
export function xHandle(
  links: readonly { kind: string; url: string }[],
): string | null {
  for (const link of links) {
    if (link.kind !== "x") continue;
    let url: URL;
    try {
      url = new URL(link.url);
    } catch {
      continue;
    }
    if (!X_HOSTS.has(url.hostname.toLowerCase())) continue;
    const name = url.pathname.split("/").find(Boolean)?.replace(/^@/, "");
    if (
      name &&
      /^[A-Za-z0-9_]{1,15}$/.test(name) &&
      !X_PAGES.has(name.toLowerCase())
    )
      return `@${name}`;
  }
  return null;
}

export interface SitemapEntry {
  path: string;
  /** Each language the address is published in, with when it last changed. */
  locales: { locale: SiteLocale; lastmod: string }[];
}

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] ?? character,
  );

/**
 * The site's sitemap: one address per page and language, each naming its
 * other languages as alternates. `href` turns a site path into the
 * absolute address on the school's website host.
 */
export function sitemapXml(
  entries: readonly SitemapEntry[],
  primary: SiteLocale,
  href: (path: string) => string,
): string {
  const urls = entries.flatMap((entry) => {
    const alternates = alternatesOf(
      entry.path,
      entry.locales.map((item) => item.locale),
      primary,
    ).map(
      (alternate) =>
        `<xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${escapeXml(href(alternate.path))}"/>`,
    );
    return entry.locales.map((item) =>
      [
        "<url>",
        `<loc>${escapeXml(href(localePath(entry.path, item.locale, primary)))}</loc>`,
        `<lastmod>${escapeXml(item.lastmod)}</lastmod>`,
        ...alternates,
        "</url>",
      ].join(""),
    );
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * What crawlers may fetch: everything, since a page kept out of search says
 * so in its own head, which a crawler must be allowed to read.
 */
export function robotsTxt(sitemap: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`;
}
