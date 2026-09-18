import type {
  PublicPageQuery,
  PublicPostsQuery,
  PublicSiteQuery,
  SitePostsQuery,
} from "@faridalms/domain/site";

import { queryOptions } from "@tanstack/react-query";

import {
  getPublicPage,
  getPublicPost,
  getPublicPosts,
  getPublicSite,
  getSiteCategories,
  getSitePage,
  getSitePages,
  getSitePost,
  getSitePostRevision,
  getSitePostRevisions,
  getSitePosts,
  getSiteSettings,
} from "~/server/site";

export const siteSettingsQuery = queryOptions({
  queryKey: ["site", "settings"],
  queryFn: () => getSiteSettings(),
});
export const sitePagesQuery = queryOptions({
  queryKey: ["site", "pages"],
  queryFn: () => getSitePages(),
});
export const sitePageQuery = (id: string) =>
  queryOptions({
    queryKey: ["site", "page", id],
    queryFn: () => getSitePage({ data: { id } }),
  });
export const siteCategoriesQuery = queryOptions({
  queryKey: ["site", "categories"],
  queryFn: () => getSiteCategories(),
});
export const sitePostsQuery = (query: SitePostsQuery) =>
  queryOptions({
    queryKey: ["site", "posts", query],
    queryFn: () => getSitePosts({ data: query }),
    placeholderData: (previous) => previous,
  });
export const sitePostQuery = (id: string) =>
  queryOptions({
    queryKey: ["site", "post", id],
    queryFn: () => getSitePost({ data: { id } }),
  });
export const sitePostRevisionsQuery = (id: string) =>
  queryOptions({
    queryKey: ["site", "post", id, "revisions"],
    queryFn: () => getSitePostRevisions({ data: { id } }),
  });
export const sitePostRevisionQuery = (id: string, revision: number) =>
  queryOptions({
    queryKey: ["site", "post", id, "revision", revision],
    queryFn: () => getSitePostRevision({ data: { id, revision } }),
  });

export const publicSiteQuery = (query: PublicSiteQuery) =>
  queryOptions({
    queryKey: ["public-site", query.school, query.locale ?? ""],
    queryFn: () => getPublicSite({ data: query }),
  });
export const publicPageQuery = (query: PublicPageQuery) =>
  queryOptions({
    queryKey: [
      "public-site",
      query.school,
      query.locale ?? "",
      "page",
      query.slug,
    ],
    queryFn: () => getPublicPage({ data: query }),
  });
export const publicPostsQuery = (query: PublicPostsQuery) =>
  queryOptions({
    queryKey: ["public-site", query.school, query.locale ?? "", "posts", query],
    queryFn: () => getPublicPosts({ data: query }),
    placeholderData: (previous) => previous,
  });
export const publicPostQuery = (query: PublicPageQuery) =>
  queryOptions({
    queryKey: [
      "public-site",
      query.school,
      query.locale ?? "",
      "post",
      query.slug,
    ],
    queryFn: () => getPublicPost({ data: query }),
  });
