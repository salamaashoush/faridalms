import { afterEach, describe, expect, it } from "vitest";

import type { SiteHeadPage, SiteHeadSite } from "./seo";

import { overwriteHostSource } from "./host";
import { seo, siteHead, siteHeadMeta } from "./seo";

const site: SiteHeadSite = {
  name: "Acme School",
  tagline: "Learning together",
  locale: "en",
  primaryLocale: "en",
  siteHost: "www.acme.example",
  logoKey: "p/abc/logo.png",
  socialLinks: [{ kind: "x", url: "https://x.com/acme_school" }],
};

const page: SiteHeadPage = {
  title: "Admissions",
  description: "How to join us",
  path: "/pages/admissions",
  locales: ["en", "ar"],
  indexed: true,
  canonical: "",
  socialPicture: { key: "p/def/gate.png", alt: "The front gate" },
};

interface Tag {
  title?: string;
  name?: string;
  property?: string;
  content?: string;
}

const content = (tags: readonly Tag[], key: string) =>
  tags.find((tag) => tag.name === key || tag.property === key)?.content;

afterEach(() =>
  overwriteHostSource(() => ({
    site: null,
    protocol: "https:",
    port: "",
    portalDomain: "",
  })),
);

describe("a school website's head", () => {
  it("names the school's own X account, and the portal names none", () => {
    expect(content(siteHeadMeta(site), "twitter:site")).toBe("@acme_school");
    expect(
      content(siteHeadMeta({ ...site, socialLinks: [] }), "twitter:site"),
    ).toBeUndefined();
    const portal = seo({ title: "Farida", description: "LMS" });
    expect(content(portal, "twitter:site")).toBeUndefined();
    expect(content(portal, "twitter:creator")).toBeUndefined();
  });

  it("points at the website host, with both languages and x-default", () => {
    const { meta, links } = siteHead(site, page);
    expect(content(meta, "og:url")).toBe(
      "https://www.acme.example/pages/admissions",
    );
    expect(content(meta, "og:image")).toBe(
      "https://www.acme.example/public-media/p/def/gate.png",
    );
    expect(content(meta, "twitter:card")).toBe("summary_large_image");
    expect(content(meta, "og:image:alt")).toBe("The front gate");
    expect(content(meta, "robots")).toBeUndefined();
    expect(links).toEqual([
      { rel: "canonical", href: "https://www.acme.example/pages/admissions" },
      {
        rel: "alternate",
        hrefLang: "en",
        href: "https://www.acme.example/pages/admissions",
      },
      {
        rel: "alternate",
        hrefLang: "ar",
        href: "https://www.acme.example/pages/admissions?lang=ar",
      },
      {
        rel: "alternate",
        hrefLang: "x-default",
        href: "https://www.acme.example/pages/admissions",
      },
    ]);
  });

  it("keeps the development scheme and port of the address it was reached on", () => {
    overwriteHostSource(() => ({
      site: "acme",
      protocol: "http:",
      port: "3000",
      portalDomain: "localhost",
    }));
    const { links } = siteHead({ ...site, locale: "ar" }, page);
    expect(links[0]).toEqual({
      rel: "canonical",
      href: "http://www.acme.example:3000/pages/admissions?lang=ar",
    });
  });

  it("follows a canonical address it names, and asks to stay out of search", () => {
    const { meta, links } = siteHead(site, {
      ...page,
      canonical: "/pages/join",
      indexed: false,
    });
    expect(content(meta, "robots")).toBe("noindex");
    expect(links).toEqual([
      { rel: "canonical", href: "https://www.acme.example/pages/join" },
    ]);
    expect(
      siteHead(site, { ...page, canonical: "https://example.org/join" })
        .links[0],
    ).toEqual({ rel: "canonical", href: "https://example.org/join" });
  });

  it("names no other language for a page published in one", () => {
    const { links } = siteHead(site, { ...page, locales: ["en"] });
    expect(links.map((link) => link.rel)).toEqual(["canonical"]);
  });
});
