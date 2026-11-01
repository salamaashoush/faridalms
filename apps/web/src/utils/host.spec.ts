import { afterEach, describe, expect, it } from "vitest";

import type { HostView } from "./host";

import {
  hostHref,
  insideWebsite,
  overwriteHostSource,
  publicPath,
  sitePath,
  sitePathIn,
  sitePathOut,
} from "./host";

const portal: HostView = { site: null, protocol: "http:", port: "3000" };
const website: HostView = {
  site: "northwind",
  protocol: "https:",
  port: "",
};

describe("a school's website on its own host", () => {
  afterEach(() => overwriteHostSource(() => portal));

  it("serves the website's pages from the root", () => {
    expect(sitePathIn("/", "northwind")).toBe("/site/northwind");
    expect(sitePathIn("/news", "northwind")).toBe("/site/northwind/news");
    expect(sitePathIn("/news/open-day", "northwind")).toBe(
      "/site/northwind/news/open-day",
    );
    expect(sitePathIn("/pages/admissions", "northwind")).toBe(
      "/site/northwind/pages/admissions",
    );
  });

  it("finds no app route there, nor another school's website", () => {
    expect(sitePathIn("/sign-in", "northwind")).toBe("/site/northwind/sign-in");
    expect(sitePathIn("/admin/site", "northwind")).toBe(
      "/site/northwind/admin/site",
    );
    expect(sitePathIn("/site/acme", "northwind")).toBe(
      "/site/northwind/site/acme",
    );
  });

  it("passes the published pictures through", () => {
    expect(sitePathIn("/public-media/p/abc/photo.webp", "northwind")).toBe(
      "/public-media/p/abc/photo.webp",
    );
  });

  it("writes the website's links back from the root", () => {
    expect(sitePathOut("/site/northwind", "northwind")).toBe("/");
    expect(sitePathOut("/site/northwind/", "northwind")).toBe("/");
    expect(sitePathOut("/site/northwind/news", "northwind")).toBe("/news");
    expect(sitePathOut("/site/northwind-east/news", "northwind")).toBe(
      "/site/northwind-east/news",
    );
    expect(sitePathOut("/sign-in", "northwind")).toBe("/sign-in");
  });

  it("addresses the website by host", () => {
    overwriteHostSource(() => website);
    expect(sitePath("northwind", "/")).toBe("/");
    expect(sitePath("northwind", "/news")).toBe("/news");
    expect(publicPath("/site/northwind/news", "northwind")).toBe("/news");
    overwriteHostSource(() => portal);
    expect(sitePath("northwind", "/")).toBe("/site/northwind");
    expect(sitePath("northwind", "/news")).toBe("/site/northwind/news");
    expect(publicPath("/site/northwind/news", "northwind")).toBe(
      "/site/northwind/news",
    );
  });

  it("turns pages inside the website without a reload, and nothing else", () => {
    overwriteHostSource(() => website);
    expect(insideWebsite("/news", "northwind")).toBe(true);
    expect(insideWebsite("/", "northwind")).toBe(true);
    expect(insideWebsite("//elsewhere.example.com", "northwind")).toBe(false);
    expect(insideWebsite("/public-media/p/x/y.png", "northwind")).toBe(false);
    expect(insideWebsite("https://example.com", "northwind")).toBe(false);
    overwriteHostSource(() => portal);
    expect(insideWebsite("/site/northwind/news", "northwind")).toBe(true);
    expect(insideWebsite("/site/northwind?lang=ar", "northwind")).toBe(true);
    expect(insideWebsite("/site/northwind-east", "northwind")).toBe(false);
    expect(insideWebsite("/news", "northwind")).toBe(false);
  });

  it("links to the school's other hosts the way the page was reached", () => {
    overwriteHostSource(() => portal);
    expect(hostHref("northwind.localhost", "/sign-in")).toBe(
      "http://northwind.localhost:3000/sign-in",
    );
    overwriteHostSource(() => website);
    expect(hostHref("portal.northwind.example.com", "/sign-in")).toBe(
      "https://portal.northwind.example.com/sign-in",
    );
  });
});
