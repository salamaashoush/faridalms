import { describe, expect, it } from "vitest";

import {
  alternatesOf,
  isPageAddress,
  isRedirectFrom,
  localePath,
  redirectPath,
  robotsTxt,
  sitemapXml,
  sitePagePath,
  xHandle,
} from "./site-seo";

describe("website addresses", () => {
  it("puts the home page at the root and the first language at the bare path", () => {
    expect(sitePagePath({ isHome: true, slug: "home" })).toBe("/");
    expect(sitePagePath({ isHome: false, slug: "about" })).toBe("/pages/about");
    expect(localePath("/pages/about", "en", "en")).toBe("/pages/about");
    expect(localePath("/pages/about", "ar", "en")).toBe("/pages/about?lang=ar");
    expect(localePath("/", "en", "ar")).toBe("/?lang=en");
  });

  it("names both languages and x-default, and nothing for a page in one", () => {
    expect(alternatesOf("/pages/about", ["en", "ar"], "en")).toEqual([
      { hreflang: "en", path: "/pages/about" },
      { hreflang: "ar", path: "/pages/about?lang=ar" },
      { hreflang: "x-default", path: "/pages/about" },
    ]);
    expect(alternatesOf("/", ["ar"], "ar")).toEqual([]);
    expect(alternatesOf("/", ["en", "en"], "en")).toEqual([]);
  });

  it("takes a path on the site or a web address, never a script or a protocol-relative one", () => {
    expect(isPageAddress("/pages/about")).toBe(true);
    expect(isPageAddress("https://example.com/about")).toBe(true);
    expect(isPageAddress("//example.com/about")).toBe(false);
    expect(isPageAddress("javascript:alert(1)")).toBe(false);
    expect(isPageAddress("mailto:office@example.com")).toBe(false);
    expect(isPageAddress("/with space")).toBe(false);
  });
});

describe("redirect paths", () => {
  it("match an old address however a visitor wrote it", () => {
    expect(redirectPath("/About-Us/")).toBe("/about-us");
    expect(redirectPath("/about-us?ref=news#top")).toBe("/about-us");
    expect(redirectPath("/%D8%B9%D9%86")).toBe("/عن");
    expect(redirectPath("/old.html")).toBe("/old.html");
    expect(redirectPath("/")).toBe("/");
  });

  it("refuse what is not a path, and the home page", () => {
    expect(redirectPath("about")).toBeNull();
    expect(redirectPath("//example.com")).toBeNull();
    expect(redirectPath("/a b")).toBeNull();
    expect(isRedirectFrom("/")).toBe(false);
    expect(isRedirectFrom("/old")).toBe(true);
    expect(isRedirectFrom(`/${"a".repeat(300)}`)).toBe(false);
  });
});

describe("the school's account on X", () => {
  it("is read from its X link, on either name of the service", () => {
    expect(xHandle([{ kind: "x", url: "https://x.com/acme_school" }])).toBe(
      "@acme_school",
    );
    expect(
      xHandle([
        { kind: "facebook", url: "https://facebook.com/acme" },
        { kind: "x", url: "https://twitter.com/@AcmeSchool?lang=ar" },
      ]),
    ).toBe("@AcmeSchool");
  });

  it("is none without a link, or with one that names no account", () => {
    expect(xHandle([])).toBeNull();
    expect(xHandle([{ kind: "x", url: "https://x.com/" }])).toBeNull();
    expect(xHandle([{ kind: "x", url: "https://x.com/intent/post" }])).toBe(
      null,
    );
    expect(xHandle([{ kind: "x", url: "https://example.com/acme" }])).toBe(
      null,
    );
  });
});

const href = (path: string) => `https://www.example.com${path}`;

describe("the sitemap", () => {
  it("lists each language of a page with its alternates and when it changed", () => {
    const xml = sitemapXml(
      [
        {
          path: "/",
          locales: [
            { locale: "en", lastmod: "2026-11-01T08:00:00.000Z" },
            { locale: "ar", lastmod: "2026-11-02T08:00:00.000Z" },
          ],
        },
        {
          path: "/news/fair",
          locales: [{ locale: "en", lastmod: "2026-11-03T08:00:00.000Z" }],
        },
      ],
      "en",
      href,
    );
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    );
    expect(xml).toContain(
      "<url><loc>https://www.example.com/?lang=ar</loc><lastmod>2026-11-02T08:00:00.000Z</lastmod>",
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/"/>',
    );
    expect(xml.match(/<url>/g)).toHaveLength(3);
    const post = xml.split("\n").find((line) => line.includes("/news/fair"));
    expect(post).not.toContain("xhtml:link");
  });

  it("escapes what it is given", () => {
    const xml = sitemapXml(
      [{ path: "/pages/a", locales: [{ locale: "en", lastmod: "x" }] }],
      "en",
      (path) => `https://example.com${path}?a=1&b=2`,
    );
    expect(xml).toContain("?a=1&amp;b=2");
  });

  it("is named in robots.txt, which lets crawlers read every page", () => {
    expect(robotsTxt("https://www.example.com/sitemap.xml")).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://www.example.com/sitemap.xml\n",
    );
  });
});
