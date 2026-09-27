import {
  applyStarterSchema,
  enquiriesQuerySchema,
  enquirySchema,
  markEnquirySchema,
  movePageSchema,
  postsQuerySchema,
  publicPageSchema,
  publicPostSchema,
  publicPostsSchema,
  publicSiteSchema,
  publishPostSchema,
  publishSchema,
  restoreSchema,
  saveCategorySchema,
  savePageSchema,
  savePostSchema,
  saveSettingsSchema,
  siteRefSchema,
} from "@faridalms/domain/website";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getSiteOverview = createServerFn({ method: "GET" }).handler(() =>
  backend().site.overview(),
);

export const saveSiteSettings = createServerFn({ method: "POST" })
  .validator(checked(saveSettingsSchema))
  .handler(({ data }) => backend().site.saveSettings(data));

export const applySiteStarter = createServerFn({ method: "POST" })
  .validator(checked(applyStarterSchema))
  .handler(({ data }) => backend().site.applyStarter(data));

export const getSitePage = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().site.page(data)));

export const saveSitePage = createServerFn({ method: "POST" })
  .validator(checked(savePageSchema))
  .handler(({ data }) => backend().site.savePage(data));

export const publishSitePage = createServerFn({ method: "POST" })
  .validator(checked(publishSchema))
  .handler(({ data }) => backend().site.publishPage(data));

export const unpublishSitePage = createServerFn({ method: "POST" })
  .validator(checked(siteRefSchema))
  .handler(({ data }) => backend().site.unpublishPage(data));

export const moveSitePage = createServerFn({ method: "POST" })
  .validator(checked(movePageSchema))
  .handler(({ data }) => backend().site.movePage(data));

export const removeSitePage = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => backend().site.removeSitePage(data));

export const restoreSitePage = createServerFn({ method: "POST" })
  .validator(checked(restoreSchema))
  .handler(({ data }) => backend().site.restorePage(data));

export const saveSiteCategory = createServerFn({ method: "POST" })
  .validator(checked(saveCategorySchema))
  .handler(({ data }) => backend().site.saveSiteCategory(data));

export const removeSiteCategory = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => backend().site.removeSiteCategory(data));

export const getSitePosts = createServerFn({ method: "GET" })
  .validator(checked(postsQuerySchema))
  .handler(({ data }) => backend().site.posts(data));

export const getSitePostOptions = createServerFn({ method: "GET" }).handler(
  () => backend().site.postOptions(),
);

export const getSitePost = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().site.post(data)));

export const saveSitePost = createServerFn({ method: "POST" })
  .validator(checked(savePostSchema))
  .handler(({ data }) => backend().site.savePost(data));

export const publishSitePost = createServerFn({ method: "POST" })
  .validator(checked(publishPostSchema))
  .handler(({ data }) => backend().site.publishPost(data));

export const unpublishSitePost = createServerFn({ method: "POST" })
  .validator(checked(siteRefSchema))
  .handler(({ data }) => backend().site.unpublishPost(data));

export const archiveSitePost = createServerFn({ method: "POST" })
  .validator(checked(siteRefSchema))
  .handler(({ data }) => backend().site.archivePost(data));

export const restoreSitePost = createServerFn({ method: "POST" })
  .validator(checked(restoreSchema))
  .handler(({ data }) => backend().site.restorePost(data));

export const submitSiteEnquiry = createServerFn({ method: "POST" })
  .validator(checked(enquirySchema))
  .handler(({ data }) => backend().site.submitEnquiry(data));

export const getSiteEnquiries = createServerFn({ method: "GET" })
  .validator(checked(enquiriesQuerySchema))
  .handler(({ data }) => backend().site.enquiries(data));

export const markSiteEnquiry = createServerFn({ method: "POST" })
  .validator(checked(markEnquirySchema))
  .handler(({ data }) => backend().site.markEnquiry(data));

export const getPublicSite = createServerFn({ method: "GET" })
  .validator(checked(publicSiteSchema))
  .handler(({ data }) => record(backend().site.publicSite(data)));

export const getPublicPage = createServerFn({ method: "GET" })
  .validator(checked(publicPageSchema))
  .handler(({ data }) => record(backend().site.publicSitePage(data)));

export const getPublicPosts = createServerFn({ method: "GET" })
  .validator(checked(publicPostsSchema))
  .handler(({ data }) => record(backend().site.publicSitePosts(data)));

export const getPublicPost = createServerFn({ method: "GET" })
  .validator(checked(publicPostSchema))
  .handler(({ data }) => record(backend().site.publicSitePost(data)));

/** The school whose own domain this request came in on, if any. */
export const getSchoolForCurrentHost = createServerFn({
  method: "GET",
}).handler(() =>
  backend(null).identity.hostSchool({
    host: (getRequestHeader("host") ?? "").slice(0, 255),
  }),
);
