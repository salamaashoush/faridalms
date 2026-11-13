import type { SiteLocale } from "@faridalms/domain/website";

import { queryOptions } from "@tanstack/react-query";

import {
  getAnnouncementSiteOptions,
  getClassWebsite,
  getPublicClasses,
  getSiteClasses,
  getPublicPage,
  getPublicPost,
  getPublicPosts,
  getPublicSite,
  getSiteOverview,
  getSitePage,
  getSiteHosts,
  getSiteRedirects,
} from "~/server/site";

export const siteOverviewQuery = queryOptions({
  queryKey: ["site", "overview"],
  queryFn: () => getSiteOverview(),
});

export const siteHostsQuery = queryOptions({
  queryKey: ["site", "hosts"],
  queryFn: () => getSiteHosts(),
});

export const siteRedirectsQuery = queryOptions({
  queryKey: ["site", "redirects"],
  queryFn: () => getSiteRedirects(),
});

export const sitePageQuery = (id: string) =>
  queryOptions({
    queryKey: ["site", "page", id],
    queryFn: () => getSitePage({ data: { id } }),
  });

export const publicSiteQuery = (school: string, locale?: SiteLocale) =>
  queryOptions({
    queryKey: ["public-site", school, locale ?? ""],
    queryFn: () => getPublicSite({ data: { school, locale } }),
  });

export const publicPageQuery = (
  school: string,
  slug: string,
  locale?: SiteLocale,
) =>
  queryOptions({
    queryKey: ["public-site", school, locale ?? "", "page", slug],
    queryFn: () => getPublicPage({ data: { school, slug, locale } }),
  });

export const publicPostsQuery = (
  school: string,
  input: { category: string; page: number; locale?: SiteLocale },
) =>
  queryOptions({
    queryKey: ["public-site", school, input.locale ?? "", "posts", input],
    queryFn: () => getPublicPosts({ data: { school, ...input } }),
  });

export const publicPostQuery = (
  school: string,
  slug: string,
  locale?: SiteLocale,
) =>
  queryOptions({
    queryKey: ["public-site", school, locale ?? "", "post", slug],
    queryFn: () => getPublicPost({ data: { school, slug, locale } }),
  });

/** The website's categories and languages an announcement on it is written for. */
export const announcementSiteOptionsQuery = queryOptions({
  queryKey: ["site", "announcement-options"],
  queryFn: () => getAnnouncementSiteOptions(),
});

/** How a class reads on the website, for its record. */
export const classWebsiteQuery = (classId: string) =>
  queryOptions({
    queryKey: ["site", "class", classId],
    queryFn: () => getClassWebsite({ data: { classId } }),
  });

/** The classes the builder's courses section is drawn and chosen from. */
export const siteClassesQuery = queryOptions({
  queryKey: ["site", "classes"],
  queryFn: () => getSiteClasses(),
});

/**
 * The classes a school shows on its website, read only for a page with a
 * courses section, so every other page asks for nothing more.
 */
export const publicClassesQuery = (
  school: string,
  locale: SiteLocale | undefined,
  wanted: boolean,
) =>
  queryOptions({
    queryKey: ["public-site", school, locale ?? "", "classes", wanted],
    queryFn: () =>
      wanted
        ? getPublicClasses({ data: { school, locale } })
        : Promise.resolve({ today: "", classes: [] }),
  });
