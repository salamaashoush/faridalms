import {
  publicPageQuerySchema,
  publicPostsQuerySchema,
  publicSiteQuerySchema,
  publishSitePostSchema,
  saveSiteCategorySchema,
  saveSitePageSchema,
  saveSitePostSchema,
  saveSiteSettingsSchema,
  sitePageRevisionSchema,
  sitePostsQuerySchema,
} from "@faridalms/domain/site";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import * as v from "valibot";

import { backend, record } from "./backend";

const idSchema = v.object({ id: v.pipe(v.string(), v.uuid()) });
const parse =
  <T extends v.GenericSchema>(schema: T) =>
  (input: unknown) =>
    v.parse(schema, input);

export const getSiteSettings = createServerFn({ method: "GET" }).handler(() =>
  backend().getSiteSettings(),
);
export const saveSiteSettings = createServerFn({ method: "POST" })
  .validator(parse(saveSiteSettingsSchema))
  .handler(({ data }) => backend().saveSiteSettings(data));

export const getSitePages = createServerFn({ method: "GET" }).handler(() =>
  backend().getSitePages(),
);
export const getSitePage = createServerFn({ method: "GET" })
  .validator(parse(idSchema))
  .handler(({ data }) => record(backend().getSitePage(data)));
export const saveSitePage = createServerFn({ method: "POST" })
  .validator(parse(saveSitePageSchema))
  .handler(({ data }) => backend().saveSitePage(data));
export const publishSitePage = createServerFn({ method: "POST" })
  .validator(parse(sitePageRevisionSchema))
  .handler(({ data }) => backend().publishSitePage(data));
export const unpublishSitePage = createServerFn({ method: "POST" })
  .validator(parse(sitePageRevisionSchema))
  .handler(({ data }) => backend().unpublishSitePage(data));
export const deleteSitePage = createServerFn({ method: "POST" })
  .validator(parse(idSchema))
  .handler(({ data }) => backend().deleteSitePage(data));

export const getSiteCategories = createServerFn({ method: "GET" }).handler(() =>
  backend().getSiteCategories(),
);
export const saveSiteCategory = createServerFn({ method: "POST" })
  .validator(parse(saveSiteCategorySchema))
  .handler(({ data }) => backend().saveSiteCategory(data));

export const getSitePosts = createServerFn({ method: "GET" })
  .validator(parse(sitePostsQuerySchema))
  .handler(({ data }) => backend().getSitePosts(data));
export const getSitePost = createServerFn({ method: "GET" })
  .validator(parse(idSchema))
  .handler(({ data }) => record(backend().getSitePost(data)));
export const saveSitePost = createServerFn({ method: "POST" })
  .validator(parse(saveSitePostSchema))
  .handler(({ data }) => backend().saveSitePost(data));
export const publishSitePost = createServerFn({ method: "POST" })
  .validator(parse(publishSitePostSchema))
  .handler(({ data }) => backend().publishSitePost(data));
export const unpublishSitePost = createServerFn({ method: "POST" })
  .validator(parse(sitePageRevisionSchema))
  .handler(({ data }) => backend().unpublishSitePost(data));
export const getSitePostRevisions = createServerFn({ method: "GET" })
  .validator(parse(idSchema))
  .handler(({ data }) => backend().getSitePostRevisions(data));
export const getSitePostRevision = createServerFn({ method: "GET" })
  .validator(
    parse(
      v.object({
        id: v.pipe(v.string(), v.uuid()),
        revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
      }),
    ),
  )
  .handler(({ data }) => record(backend().getSitePostRevision(data)));

export const getPublicSite = createServerFn({ method: "GET" })
  .validator(parse(publicSiteQuerySchema))
  .handler(({ data }) => record(backend().getPublicSite(data)));
export const getPublicPage = createServerFn({ method: "GET" })
  .validator(parse(publicPageQuerySchema))
  .handler(({ data }) => record(backend().getPublicPage(data)));
export const getPublicPosts = createServerFn({ method: "GET" })
  .validator(parse(publicPostsQuerySchema))
  .handler(({ data }) => record(backend().getPublicPosts(data)));
export const getPublicPost = createServerFn({ method: "GET" })
  .validator(parse(publicPageQuerySchema))
  .handler(({ data }) => record(backend().getPublicPost(data)));
export const getSchoolForCurrentHost = createServerFn({
  method: "GET",
}).handler(() =>
  backend(null).identity.hostSchool({
    host: (getRequestHeader("host") ?? "").slice(0, 255),
  }),
);
