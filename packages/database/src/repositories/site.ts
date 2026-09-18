import type {
  PublishSitePostInput,
  SaveSiteCategoryInput,
  SaveSitePageInput,
  SaveSitePostInput,
  SaveSiteSettingsInput,
  SiteLocale,
  SitePageRevisionInput,
  SitePostsQuery,
} from "@faridalms/domain/site";

import {
  SITE_HOME_SLUG,
  SITE_POSTS_PAGE_SIZE,
  pageAssetIds,
  sitePagePublishIssues,
  sitePostPublishIssues,
} from "@faridalms/domain/site";
import { and, count, eq, isNotNull, lte } from "drizzle-orm";

import type { Database } from "../index";

import { schema } from "../index";
import { ManagementError } from "./management";

const {
  siteSettings,
  sitePages,
  sitePosts,
  sitePostCategories,
  sitePostRevisions,
} = schema;

export interface SiteFile {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
}
const fileColumns = {
  id: true,
  name: true,
  mediaType: true,
  sizeBytes: true,
} as const;

export const DEFAULT_SITE_SETTINGS = {
  logo: null as SiteFile | null,
  tagline: "",
  taglineAr: "",
  primaryColor: "#0f766e",
  logoFileId: null as string | null,
  contactEmail: "",
  contactPhone: "",
  address: "",
  mapUrl: "",
  socialLinks: [] as { label: string; url: string }[],
  defaultLocale: "en" as SiteLocale,
  isPublished: false,
  revision: 0,
};
export type SiteSettings = typeof DEFAULT_SITE_SETTINGS;

export async function getSiteSettings(db: Database): Promise<SiteSettings> {
  const row = await db.query.siteSettings.findFirst({
    where: { slot: 1 },
    with: { logo: { columns: { ...fileColumns, state: true } } },
  });
  if (!row) return { ...DEFAULT_SITE_SETTINGS };
  const logo = row.logo;
  return {
    logo:
      logo?.state === "ready"
        ? {
            id: logo.id,
            name: logo.name,
            mediaType: logo.mediaType,
            sizeBytes: logo.sizeBytes,
          }
        : null,
    tagline: row.tagline,
    taglineAr: row.taglineAr,
    primaryColor: row.primaryColor,
    logoFileId: row.logoFileId,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    address: row.address,
    mapUrl: row.mapUrl,
    socialLinks: row.socialLinks,
    defaultLocale: row.defaultLocale,
    isPublished: row.isPublished,
    revision: row.revision,
  };
}

export async function saveSiteSettings(
  db: Database,
  userId: string,
  input: SaveSiteSettingsInput,
) {
  const { expectedRevision, ...values } = input;
  if (expectedRevision === 0) {
    const [created] = await db
      .insert(siteSettings)
      .values({ ...values, slot: 1, updatedById: userId })
      .onConflictDoNothing()
      .returning({ revision: siteSettings.revision });
    if (!created)
      throw new ManagementError("CONFLICT", "site.revision_conflict");
    return created;
  }
  const [updated] = await db
    .update(siteSettings)
    .set({
      ...values,
      updatedById: userId,
      revision: expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(siteSettings.slot, 1),
        eq(siteSettings.revision, expectedRevision),
      ),
    )
    .returning({ revision: siteSettings.revision });
  if (!updated) throw new ManagementError("CONFLICT", "site.revision_conflict");
  return updated;
}

// --- pages --------------------------------------------------------------------

export async function listSitePages(db: Database) {
  return db.query.sitePages.findMany({
    columns: {
      id: true,
      slug: true,
      locale: true,
      title: true,
      navGroup: true,
      navOrder: true,
      showInNav: true,
      status: true,
      revision: true,
      publishedAt: true,
      updatedAt: true,
    },
    orderBy: { locale: "asc", navGroup: "asc", navOrder: "asc", title: "asc" },
  });
}

export async function getSitePage(db: Database, id: string) {
  return db.query.sitePages.findFirst({ where: { id } });
}

async function assertPageSlugFree(
  db: Database,
  input: { id: string; slug: string; locale: SiteLocale },
) {
  const clash = await db.query.sitePages.findFirst({
    where: { slug: input.slug, locale: input.locale, id: { ne: input.id } },
    columns: { id: true },
  });
  if (clash) throw new ManagementError("CONFLICT", "site.slug_taken");
}

export async function saveSitePage(
  db: Database,
  userId: string,
  input: SaveSitePageInput,
) {
  await assertPageSlugFree(db, input);
  const { expectedRevision, ...values } = input;
  if (expectedRevision === 0) {
    const [created] = await db
      .insert(sitePages)
      .values({ ...values, authorId: userId, updatedById: userId })
      .onConflictDoNothing()
      .returning({ id: sitePages.id, revision: sitePages.revision });
    if (!created)
      throw new ManagementError("CONFLICT", "site.revision_conflict");
    return created;
  }
  const [updated] = await db
    .update(sitePages)
    .set({
      ...values,
      updatedById: userId,
      revision: expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(eq(sitePages.id, input.id), eq(sitePages.revision, expectedRevision)),
    )
    .returning({ id: sitePages.id, revision: sitePages.revision });
  if (!updated) {
    if (!(await getSitePage(db, input.id)))
      throw new ManagementError("NOT_FOUND", "site.not_found");
    throw new ManagementError("CONFLICT", "site.revision_conflict");
  }
  return updated;
}

export async function publishSitePage(
  db: Database,
  input: SitePageRevisionInput,
  now: Date,
) {
  const page = await getSitePage(db, input.id);
  if (!page) throw new ManagementError("NOT_FOUND", "site.not_found");
  if (page.revision !== input.expectedRevision)
    throw new ManagementError("CONFLICT", "site.revision_conflict");
  if (sitePagePublishIssues(page).length > 0)
    throw new ManagementError("BAD_REQUEST", "site.incomplete");
  const [updated] = await db
    .update(sitePages)
    .set({
      status: "published",
      published: {
        title: page.title,
        summary: page.summary,
        document: page.document,
      },
      publishedAt: now,
      revision: page.revision + 1,
      updatedAt: now,
    })
    .where(
      and(eq(sitePages.id, page.id), eq(sitePages.revision, page.revision)),
    )
    .returning({ id: sitePages.id, revision: sitePages.revision });
  if (!updated) throw new ManagementError("CONFLICT", "site.revision_conflict");
  return updated;
}

export async function unpublishSitePage(
  db: Database,
  input: SitePageRevisionInput,
) {
  const [updated] = await db
    .update(sitePages)
    .set({
      status: "draft",
      published: null,
      publishedAt: null,
      revision: input.expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sitePages.id, input.id),
        eq(sitePages.revision, input.expectedRevision),
      ),
    )
    .returning({ id: sitePages.id, revision: sitePages.revision });
  if (!updated) {
    if (!(await getSitePage(db, input.id)))
      throw new ManagementError("NOT_FOUND", "site.not_found");
    throw new ManagementError("CONFLICT", "site.revision_conflict");
  }
  return updated;
}

export async function deleteSitePage(db: Database, id: string) {
  const page = await getSitePage(db, id);
  if (!page) throw new ManagementError("NOT_FOUND", "site.not_found");
  if (page.status === "published")
    throw new ManagementError("BAD_REQUEST", "site.page_published");
  await db.delete(sitePages).where(eq(sitePages.id, id));
  return { id };
}

// --- categories ---------------------------------------------------------------

export async function listSiteCategories(db: Database) {
  return db.query.sitePostCategories.findMany({
    orderBy: { sortOrder: "asc", name: "asc" },
  });
}

export async function saveSiteCategory(
  db: Database,
  input: SaveSiteCategoryInput,
) {
  const clash = await db.query.sitePostCategories.findFirst({
    where: { slug: input.slug, id: { ne: input.id } },
    columns: { id: true },
  });
  if (clash) throw new ManagementError("CONFLICT", "site.slug_taken");
  const [saved] = await db
    .insert(sitePostCategories)
    .values(input)
    .onConflictDoUpdate({
      target: sitePostCategories.id,
      set: {
        slug: input.slug,
        name: input.name,
        nameAr: input.nameAr,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      },
    })
    .returning();
  return saved;
}

// --- posts --------------------------------------------------------------------

export async function listSitePosts(db: Database, query: SitePostsQuery) {
  const filter =
    query.status === "all" ? undefined : eq(sitePosts.status, query.status);
  const [totals] = await db
    .select({ total: count() })
    .from(sitePosts)
    .where(filter);
  const total = totals?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(query.page, pages);
  const rows = await db.query.sitePosts.findMany({
    columns: {
      id: true,
      slug: true,
      locale: true,
      title: true,
      status: true,
      revision: true,
      publishAt: true,
      updatedAt: true,
    },
    with: {
      category: { columns: { id: true, name: true, nameAr: true } },
      author: { columns: { id: true, name: true } },
    },
    where: query.status === "all" ? undefined : { status: query.status },
    orderBy: { updatedAt: "desc", id: "asc" },
    limit: 25,
    offset: (page - 1) * 25,
  });
  return { rows, total, pages, page };
}

export async function getSitePost(db: Database, id: string) {
  return db.query.sitePosts.findFirst({
    where: { id },
    with: {
      category: { columns: { id: true, name: true, nameAr: true } },
      author: { columns: { id: true, name: true } },
      cover: { columns: fileColumns },
    },
  });
}

export async function listSitePostRevisions(db: Database, postId: string) {
  return db.query.sitePostRevisions.findMany({
    where: { postId },
    columns: { id: true, revision: true, title: true, createdAt: true },
    with: { savedBy: { columns: { id: true, name: true } } },
    orderBy: { revision: "desc" },
  });
}

export async function getSitePostRevision(
  db: Database,
  postId: string,
  revision: number,
) {
  return db.query.sitePostRevisions.findFirst({
    where: { postId, revision },
    with: { savedBy: { columns: { id: true, name: true } } },
  });
}

export async function saveSitePost(
  db: Database,
  userId: string,
  input: SaveSitePostInput,
) {
  const clash = await db.query.sitePosts.findFirst({
    where: { slug: input.slug, locale: input.locale, id: { ne: input.id } },
    columns: { id: true },
  });
  if (clash) throw new ManagementError("CONFLICT", "site.slug_taken");
  const { expectedRevision, ...values } = input;
  return db.transaction(async (tx) => {
    let saved: { id: string; revision: number } | undefined;
    if (expectedRevision === 0) {
      [saved] = await tx
        .insert(sitePosts)
        .values({ ...values, authorId: userId, updatedById: userId })
        .onConflictDoNothing()
        .returning({ id: sitePosts.id, revision: sitePosts.revision });
      if (!saved)
        throw new ManagementError("CONFLICT", "site.revision_conflict");
    } else {
      [saved] = await tx
        .update(sitePosts)
        .set({
          ...values,
          updatedById: userId,
          revision: expectedRevision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sitePosts.id, input.id),
            eq(sitePosts.revision, expectedRevision),
          ),
        )
        .returning({ id: sitePosts.id, revision: sitePosts.revision });
      if (!saved) {
        if (!(await tx.query.sitePosts.findFirst({ where: { id: input.id } })))
          throw new ManagementError("NOT_FOUND", "site.not_found");
        throw new ManagementError("CONFLICT", "site.revision_conflict");
      }
    }
    await tx.insert(sitePostRevisions).values({
      postId: saved.id,
      revision: saved.revision,
      title: input.title,
      summary: input.summary,
      document: input.document,
      savedById: userId,
    });
    return saved;
  });
}

export async function publishSitePost(
  db: Database,
  input: PublishSitePostInput,
  now: Date,
) {
  const post = await db.query.sitePosts.findFirst({ where: { id: input.id } });
  if (!post) throw new ManagementError("NOT_FOUND", "site.not_found");
  if (post.revision !== input.expectedRevision)
    throw new ManagementError("CONFLICT", "site.revision_conflict");
  if (sitePostPublishIssues(post).length > 0)
    throw new ManagementError("BAD_REQUEST", "site.incomplete");
  const publishAt = input.publishAt ? new Date(input.publishAt) : now;
  const [updated] = await db
    .update(sitePosts)
    .set({
      status: "published",
      publishAt,
      published: {
        title: post.title,
        summary: post.summary,
        document: post.document,
        coverFileId: post.coverFileId,
      },
      revision: post.revision + 1,
      updatedAt: now,
    })
    .where(
      and(eq(sitePosts.id, post.id), eq(sitePosts.revision, post.revision)),
    )
    .returning({
      id: sitePosts.id,
      revision: sitePosts.revision,
      publishAt: sitePosts.publishAt,
    });
  if (!updated) throw new ManagementError("CONFLICT", "site.revision_conflict");
  return updated;
}

export async function unpublishSitePost(
  db: Database,
  input: SitePageRevisionInput,
) {
  const [updated] = await db
    .update(sitePosts)
    .set({
      status: "draft",
      published: null,
      publishAt: null,
      revision: input.expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sitePosts.id, input.id),
        eq(sitePosts.revision, input.expectedRevision),
      ),
    )
    .returning({ id: sitePosts.id, revision: sitePosts.revision });
  if (!updated) {
    if (!(await db.query.sitePosts.findFirst({ where: { id: input.id } })))
      throw new ManagementError("NOT_FOUND", "site.not_found");
    throw new ManagementError("CONFLICT", "site.revision_conflict");
  }
  return updated;
}

// --- public reads ---------------------------------------------------------------

function categoryLabel(
  category: { name: string; nameAr: string } | null | undefined,
  locale: SiteLocale,
) {
  if (!category) return null;
  return locale === "ar" && category.nameAr ? category.nameAr : category.name;
}

async function publishedPosts(
  db: Database,
  locale: SiteLocale,
  now: Date,
  options: { categoryId?: string; limit: number; offset: number },
) {
  const rows = await db.query.sitePosts.findMany({
    where: {
      locale,
      status: "published",
      publishAt: { lte: now },
      ...(options.categoryId ? { categoryId: options.categoryId } : {}),
    },
    columns: { id: true, slug: true, publishAt: true, published: true },
    with: {
      category: { columns: { slug: true, name: true, nameAr: true } },
      author: { columns: { name: true } },
    },
    orderBy: { publishAt: "desc", id: "asc" },
    limit: options.limit,
    offset: options.offset,
  });
  return rows.flatMap((row) =>
    row.published && row.publishAt
      ? [
          {
            slug: row.slug,
            title: row.published.title,
            summary: row.published.summary,
            coverFileId: row.published.coverFileId,
            publishAt: row.publishAt,
            author: row.author?.name ?? null,
            category: row.category
              ? {
                  slug: row.category.slug,
                  name:
                    categoryLabel(row.category, locale) ?? row.category.name,
                }
              : null,
          },
        ]
      : [],
  );
}

export async function publicSite(
  db: Database,
  requested: SiteLocale | undefined,
  now: Date,
) {
  const settings = await getSiteSettings(db);
  if (!settings.isPublished) return undefined;
  const locale = requested ?? settings.defaultLocale;
  const pages = await db.query.sitePages.findMany({
    where: { locale, status: "published" },
    columns: {
      slug: true,
      navGroup: true,
      navOrder: true,
      showInNav: true,
      published: true,
    },
    orderBy: { navGroup: "asc", navOrder: "asc", title: "asc" },
  });
  const home = pages.find((page) => page.slug === SITE_HOME_SLUG);
  return {
    locale,
    settings,
    navigation: pages
      .filter((page) => page.showInNav && page.slug !== SITE_HOME_SLUG)
      .map((page) => ({
        slug: page.slug,
        title: page.published?.title ?? "",
        group: page.navGroup,
        order: page.navOrder,
      })),
    home: home?.published ?? null,
    posts: await publishedPosts(db, locale, now, { limit: 3, offset: 0 }),
  };
}

export async function publicPage(
  db: Database,
  locale: SiteLocale,
  slug: string,
) {
  const page = await db.query.sitePages.findFirst({
    where: { locale, slug, status: "published" },
    columns: { slug: true, published: true, publishedAt: true },
  });
  if (!page?.published) return undefined;
  return { slug: page.slug, publishedAt: page.publishedAt, ...page.published };
}

export async function publicPosts(
  db: Database,
  locale: SiteLocale,
  categorySlug: string,
  requestedPage: number,
  now: Date,
) {
  const categories = await listSiteCategories(db);
  const category = categorySlug
    ? categories.find((item) => item.slug === categorySlug)
    : undefined;
  if (categorySlug && !category)
    return { rows: [], total: 0, pages: 1, page: 1, categories: [] };
  const filter = and(
    eq(sitePosts.locale, locale),
    eq(sitePosts.status, "published"),
    lte(sitePosts.publishAt, now),
    category ? eq(sitePosts.categoryId, category.id) : undefined,
  );
  const [totals] = await db
    .select({ total: count() })
    .from(sitePosts)
    .where(filter);
  const total = totals?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / SITE_POSTS_PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  return {
    rows: await publishedPosts(db, locale, now, {
      categoryId: category?.id,
      limit: SITE_POSTS_PAGE_SIZE,
      offset: (page - 1) * SITE_POSTS_PAGE_SIZE,
    }),
    total,
    pages,
    page,
    categories: categories.map((item) => ({
      slug: item.slug,
      name: categoryLabel(item, locale) ?? item.name,
    })),
  };
}

export async function publicPost(
  db: Database,
  locale: SiteLocale,
  slug: string,
  now: Date,
) {
  const post = await db.query.sitePosts.findFirst({
    where: { locale, slug, status: "published", publishAt: { lte: now } },
    columns: { slug: true, publishAt: true, published: true },
    with: {
      category: { columns: { slug: true, name: true, nameAr: true } },
      author: { columns: { name: true } },
    },
  });
  if (!post?.published || !post.publishAt) return undefined;
  return {
    slug: post.slug,
    publishAt: post.publishAt,
    author: post.author?.name ?? null,
    category: post.category
      ? {
          slug: post.category.slug,
          name: categoryLabel(post.category, locale) ?? post.category.name,
        }
      : null,
    ...post.published,
  };
}

/** Files the public may read: whatever published content or the logo points at. */
export async function publicAssetIds(db: Database, now: Date) {
  const ids = new Set<string>();
  const settings = await db.query.siteSettings.findFirst({
    where: { slot: 1 },
    columns: { isPublished: true, logoFileId: true },
  });
  if (!settings?.isPublished) return ids;
  if (settings.logoFileId) ids.add(settings.logoFileId);
  const pages = await db.query.sitePages.findMany({
    where: { status: "published" },
    columns: { published: true },
  });
  for (const page of pages)
    if (page.published)
      for (const id of pageAssetIds(page.published.document)) ids.add(id);
  const posts = await db
    .select({ published: sitePosts.published })
    .from(sitePosts)
    .where(
      and(
        eq(sitePosts.status, "published"),
        lte(sitePosts.publishAt, now),
        isNotNull(sitePosts.published),
      ),
    );
  for (const post of posts)
    if (post.published?.coverFileId) ids.add(post.published.coverFileId);
  return ids;
}
