import type { SiteLocale } from "@faridalms/domain/website";

import { queryOptions } from "@tanstack/react-query";

import {
  getPublicPage,
  getPublicPost,
  getPublicPosts,
  getPublicSite,
  getSiteOverview,
  getSitePage,
  getSiteEnquiries,
} from "~/server/site";

export const siteOverviewQuery = queryOptions({
  queryKey: ["site", "overview"],
  queryFn: () => getSiteOverview(),
});

export const sitePageQuery = (id: string) =>
  queryOptions({
    queryKey: ["site", "page", id],
    queryFn: () => getSitePage({ data: { id } }),
  });

export const siteEnquiriesQuery = (handled: boolean) =>
  queryOptions({
    queryKey: ["site", "enquiries", handled],
    queryFn: () => getSiteEnquiries({ data: { handled } }),
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
