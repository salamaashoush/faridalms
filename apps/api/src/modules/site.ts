import { ManagementError } from "@faridalms/database/repositories/management";
import * as repo from "@faridalms/database/repositories/site";
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
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import { requirePermission } from "../authorization";
import { protectedProcedure, publicProcedure } from "../procedure";
import { schoolForHost, withPublicSchool } from "../public-school";

const id = v.object({ id: v.pipe(v.string(), v.uuid()) });

async function managed<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ManagementError)
      throw new ORPCError(error.code, { message: error.message });
    throw error;
  }
}

// --- administration -----------------------------------------------------------

export const getSiteSettings = protectedProcedure.handler(
  async ({ context }) => {
    await requirePermission(context, "site:manage");
    return {
      settings: await repo.getSiteSettings(context.db),
      school: {
        slug: context.school.slug,
        name: context.school.name,
        publicDomain: context.school.publicDomain,
      },
    };
  },
);

export const saveSiteSettings = protectedProcedure
  .input(saveSiteSettingsSchema)
  .handler(async ({ context, input }) => {
    const user = await requirePermission(context, "site:manage");
    return managed(() => repo.saveSiteSettings(context.db, user.id, input));
  });

export const getSitePages = protectedProcedure.handler(async ({ context }) => {
  await requirePermission(context, "site:manage");
  return repo.listSitePages(context.db);
});

export const getSitePage = protectedProcedure
  .input(id)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "site:manage");
    const page = await repo.getSitePage(context.db, input.id);
    if (!page) throw new ORPCError("NOT_FOUND");
    return page;
  });

export const saveSitePage = protectedProcedure
  .input(saveSitePageSchema)
  .handler(async ({ context, input }) => {
    const user = await requirePermission(context, "site:manage");
    return managed(() => repo.saveSitePage(context.db, user.id, input));
  });

export const publishSitePage = protectedProcedure
  .input(sitePageRevisionSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "site:manage");
    return managed(() => repo.publishSitePage(context.db, input, new Date()));
  });

export const unpublishSitePage = protectedProcedure
  .input(sitePageRevisionSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "site:manage");
    return managed(() => repo.unpublishSitePage(context.db, input));
  });

export const deleteSitePage = protectedProcedure
  .input(id)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "site:manage");
    return managed(() => repo.deleteSitePage(context.db, input.id));
  });

export const getSiteCategories = protectedProcedure.handler(
  async ({ context }) => {
    await requirePermission(context, "site:manage");
    return repo.listSiteCategories(context.db);
  },
);

export const saveSiteCategory = protectedProcedure
  .input(saveSiteCategorySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "site:manage");
    return managed(() => repo.saveSiteCategory(context.db, input));
  });

export const getSitePosts = protectedProcedure
  .input(sitePostsQuerySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "site:manage");
    return repo.listSitePosts(context.db, input);
  });

export const getSitePost = protectedProcedure
  .input(id)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "site:manage");
    const post = await repo.getSitePost(context.db, input.id);
    if (!post) throw new ORPCError("NOT_FOUND");
    return post;
  });

export const saveSitePost = protectedProcedure
  .input(saveSitePostSchema)
  .handler(async ({ context, input }) => {
    const user = await requirePermission(context, "site:manage");
    return managed(() => repo.saveSitePost(context.db, user.id, input));
  });

export const publishSitePost = protectedProcedure
  .input(publishSitePostSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "site:manage");
    return managed(() => repo.publishSitePost(context.db, input, new Date()));
  });

export const unpublishSitePost = protectedProcedure
  .input(sitePageRevisionSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "site:manage");
    return managed(() => repo.unpublishSitePost(context.db, input));
  });

export const getSitePostRevisions = protectedProcedure
  .input(id)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "site:manage");
    return repo.listSitePostRevisions(context.db, input.id);
  });

export const getSitePostRevision = protectedProcedure
  .input(
    v.object({
      id: v.pipe(v.string(), v.uuid()),
      revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
    }),
  )
  .handler(async ({ context, input }) => {
    await requirePermission(context, "site:manage");
    const row = await repo.getSitePostRevision(
      context.db,
      input.id,
      input.revision,
    );
    if (!row) throw new ORPCError("NOT_FOUND");
    return row;
  });

// --- public site ----------------------------------------------------------------

export const getPublicSite = publicProcedure
  .input(publicSiteQuerySchema)
  .handler(({ context, input }) =>
    withPublicSchool(context, input.school, async (db, school) => {
      const site = await repo.publicSite(db, input.locale, new Date());
      if (!site) throw new ORPCError("NOT_FOUND");
      return { school: { slug: school.slug, name: school.name }, ...site };
    }),
  );

export const getPublicPage = publicProcedure
  .input(publicPageQuerySchema)
  .handler(({ context, input }) =>
    withPublicSchool(context, input.school, async (db) => {
      const settings = await repo.getSiteSettings(db);
      if (!settings.isPublished) throw new ORPCError("NOT_FOUND");
      const page = await repo.publicPage(
        db,
        input.locale ?? settings.defaultLocale,
        input.slug,
      );
      if (!page) throw new ORPCError("NOT_FOUND");
      return page;
    }),
  );

export const getPublicPosts = publicProcedure
  .input(publicPostsQuerySchema)
  .handler(({ context, input }) =>
    withPublicSchool(context, input.school, async (db) => {
      const settings = await repo.getSiteSettings(db);
      if (!settings.isPublished) throw new ORPCError("NOT_FOUND");
      return repo.publicPosts(
        db,
        input.locale ?? settings.defaultLocale,
        input.category,
        input.page,
        new Date(),
      );
    }),
  );

export const getPublicPost = publicProcedure
  .input(publicPageQuerySchema)
  .handler(({ context, input }) =>
    withPublicSchool(context, input.school, async (db) => {
      const settings = await repo.getSiteSettings(db);
      if (!settings.isPublished) throw new ORPCError("NOT_FOUND");
      const post = await repo.publicPost(
        db,
        input.locale ?? settings.defaultLocale,
        input.slug,
        new Date(),
      );
      if (!post) throw new ORPCError("NOT_FOUND");
      return post;
    }),
  );

/** Which school, if any, publishes its site on the requested host. */
export const getSchoolForHost = publicProcedure
  .input(v.object({ host: v.pipe(v.string(), v.maxLength(255)) }))
  .handler(({ context, input }) => schoolForHost(context, input.host));
