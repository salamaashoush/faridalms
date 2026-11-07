import type { SiteLocale } from "@faridalms/domain/site-sections";

import { alternatesOf, localePath, xHandle } from "@faridalms/domain/site-seo";

import { hostHref } from "./host";

interface SeoProps {
  title: string;
  description: string;
  keywords?: string;
  image?: string;
}

export const seo = ({ title, description, keywords, image }: SeoProps) => {
  const tags = [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: keywords },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    ...(image
      ? [
          { name: "twitter:image", content: image },
          { name: "twitter:card", content: "summary_large_image" },
          { property: "og:image", content: image },
        ]
      : []),
  ];

  return tags;
};

export interface SiteHeadSite {
  name: string;
  tagline: string;
  locale: SiteLocale;
  primaryLocale: SiteLocale;
  siteHost: string;
  logoKey: string | null;
  socialLinks: readonly { kind: string; url: string }[];
}

export interface SiteHeadPage {
  title: string;
  description: string;
  /** The page's path on the website host, in the site's first language. */
  path: string;
  /** The languages it is published in; one gives no alternates. */
  locales: readonly SiteLocale[];
  indexed: boolean;
  /** A path on the site or an address elsewhere; empty for the page's own. */
  canonical: string;
  socialPicture: { key: string; alt: string } | null;
  kind?: "website" | "article";
}

const absolute = (site: SiteHeadSite, address: string) =>
  address.startsWith("/") ? hostHref(site.siteHost, address) : address;

const mediaHref = (site: SiteHeadSite, key: string) =>
  hostHref(site.siteHost, `/public-media/${key}`);

const imageTags = (
  image: string,
  alt: string,
  card: "summary" | "summary_large_image",
) => [
  { property: "og:image", content: image },
  { name: "twitter:image", content: image },
  { name: "twitter:card", content: card },
  ...(alt
    ? [
        { property: "og:image:alt", content: alt },
        { name: "twitter:image:alt", content: alt },
      ]
    : []),
];

/**
 * What every page of a school's website says of itself to search engines
 * and social sites until the page says more: the school's name, its line,
 * its logo and its own account on X. The platform's name and accounts
 * never appear.
 */
export function siteHeadMeta(site: SiteHeadSite) {
  const handle = xHandle(site.socialLinks);
  return [
    { title: site.name },
    { property: "og:site_name", content: site.name },
    { property: "og:type", content: "website" },
    { property: "og:title", content: site.name },
    { name: "twitter:title", content: site.name },
    ...(site.tagline
      ? [
          { name: "description", content: site.tagline },
          { property: "og:description", content: site.tagline },
          { name: "twitter:description", content: site.tagline },
        ]
      : []),
    ...(site.logoKey
      ? imageTags(mediaHref(site, site.logoKey), "", "summary")
      : [{ name: "twitter:card", content: "summary" }]),
    ...(handle ? [{ name: "twitter:site", content: handle }] : []),
  ];
}

/**
 * A published page's head: its words and picture for shared links, its
 * own address or the one it names instead, the other language it is
 * published in, and whether search engines may list it.
 */
export function siteHead(site: SiteHeadSite, page: SiteHeadPage) {
  const own = localePath(page.path, site.locale, site.primaryLocale);
  const url = hostHref(site.siteHost, own);
  const meta = [
    { title: page.title },
    { property: "og:type", content: page.kind ?? "website" },
    { property: "og:title", content: page.title },
    { name: "twitter:title", content: page.title },
    { property: "og:url", content: url },
    ...(page.description
      ? [
          { name: "description", content: page.description },
          { property: "og:description", content: page.description },
          { name: "twitter:description", content: page.description },
        ]
      : []),
    ...(page.socialPicture
      ? imageTags(
          mediaHref(site, page.socialPicture.key),
          page.socialPicture.alt,
          "summary_large_image",
        )
      : []),
    ...(page.indexed ? [] : [{ name: "robots", content: "noindex" }]),
  ];
  const links = [
    { rel: "canonical", href: absolute(site, page.canonical || own) },
    ...(page.indexed
      ? alternatesOf(page.path, page.locales, site.primaryLocale).map(
          (alternate) => ({
            rel: "alternate",
            hrefLang: alternate.hreflang,
            href: hostHref(site.siteHost, alternate.path),
          }),
        )
      : []),
  ];
  return { meta, links };
}
