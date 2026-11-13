import { addHostSchema, hostRefSchema } from "@faridalms/domain/hosts";
import {
  classWebsiteSchema,
  publicClassesSchema,
} from "@faridalms/domain/site-classes";
import {
  applyStarterSchema,
  enquirySchema,
  movePageSchema,
  pageBatchSchema,
  publicPageSchema,
  publicPostSchema,
  publicPostsSchema,
  publicRedirectSchema,
  publicSiteSchema,
  publishSchema,
  saveCategorySchema,
  savePageSchema,
  saveRedirectSchema,
  saveSettingsSchema,
  siteRefSchema,
} from "@faridalms/domain/website";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

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

export const batchSitePages = createServerFn({ method: "POST" })
  .validator(checked(pageBatchSchema))
  .handler(({ data }) => backend().site.batchPages(data));

export const saveSiteCategory = createServerFn({ method: "POST" })
  .validator(checked(saveCategorySchema))
  .handler(({ data }) => backend().site.saveSiteCategory(data));

export const removeSiteCategory = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => backend().site.removeSiteCategory(data));

export const submitSiteEnquiry = createServerFn({ method: "POST" })
  .validator(checked(enquirySchema))
  .handler(({ data }) => backend().site.submitEnquiry(data));

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

export const getPublicRedirect = createServerFn({ method: "GET" })
  .validator(checked(publicRedirectSchema))
  .handler(({ data }) => record(backend().site.publicSiteRedirect(data)));

export const getSiteRedirects = createServerFn({ method: "GET" }).handler(() =>
  backend().site.redirects(),
);

export const saveSiteRedirect = createServerFn({ method: "POST" })
  .validator(checked(saveRedirectSchema))
  .handler(({ data }) => backend().site.saveSiteRedirect(data));

export const removeSiteRedirect = createServerFn({ method: "POST" })
  .validator(checked(siteRefSchema))
  .handler(({ data }) => backend().site.removeSiteRedirect(data));

export const getSiteHosts = createServerFn({ method: "GET" }).handler(() =>
  backend().hosts.list(),
);

export const addSiteHost = createServerFn({ method: "POST" })
  .validator(checked(addHostSchema))
  .handler(({ data }) => backend().hosts.add(data));

export const removeSiteHost = createServerFn({ method: "POST" })
  .validator(checked(hostRefSchema))
  .handler(({ data }) => backend().hosts.remove(data));

export const makeSiteHostCanonical = createServerFn({ method: "POST" })
  .validator(checked(hostRefSchema))
  .handler(({ data }) => backend().hosts.makeCanonical(data));

export const checkSiteHost = createServerFn({ method: "POST" })
  .validator(checked(hostRefSchema))
  .handler(({ data }) => backend().hosts.check(data));

export const getAnnouncementPost = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => backend().site.announcementPost(data));

export const getAnnouncementSiteOptions = createServerFn({
  method: "GET",
}).handler(() => backend().site.announcementOptions());

const byClass = v.object({ classId: v.pipe(v.string(), v.uuid()) });

export const getClassWebsite = createServerFn({ method: "GET" })
  .validator(checked(byClass))
  .handler(({ data }) => backend().site.classWebsite(data));

export const saveClassWebsite = createServerFn({ method: "POST" })
  .validator(checked(classWebsiteSchema))
  .handler(({ data }) => backend().site.saveClassWebsite(data));

export const getSiteClasses = createServerFn({ method: "GET" }).handler(() =>
  backend().site.siteClasses(),
);

export const getPublicClasses = createServerFn({ method: "GET" })
  .validator(checked(publicClassesSchema))
  .handler(({ data }) => record(backend().site.publicSiteClassList(data)));
