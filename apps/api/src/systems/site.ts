import type { PageRow, PostRow } from "@faridalms/database/stores/site";
import type {
  PageContent,
  PostContent,
  SiteIssue,
  SiteLocale,
} from "@faridalms/domain/website";

import {
  contentToRestore,
  documentOf,
  dropTranslation,
  saveDocument,
  saveTranslation,
  snapshotPublish,
  translationOf,
  versionsOf,
} from "@faridalms/database/stores/documents";
import {
  insertPage,
  insertPost,
  markRevised,
  pageById,
  placePage,
  postById,
  publicCategories,
  publicMenu,
  publicationsOf,
  publicPage,
  publicPost,
  publicPosts,
  publicSchool,
  removeCategory,
  removePage,
  saveCategory,
  saveSiteSettings,
  setPageState,
  setPostState,
  siteCategories,
  sitePages,
  sitePosts,
  siteSettings,
  syncPublishedPlaces,
  updatePage,
  updatePost,
  withdrawPage,
  withdrawPost,
  writePublishedPage,
  writePublishedPost,
} from "@faridalms/database/stores/site";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import {
  buildTemplate,
  STARTERS,
  starterChrome,
} from "@faridalms/domain/site-templates";
import {
  defaultTheme,
  emptyChrome,
  resolveTheme,
  siteChromeSchema,
  siteThemeSchema,
} from "@faridalms/domain/site-theme";
import {
  alignTranslation,
  applyStarterSchema,
  localizedSections,
  movePageSchema,
  pageContentSchema,
  pageFileIds,
  pageIssues,
  pagePlainText,
  pageSectionSchema,
  postContentSchema,
  postIssues,
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
  SITE_POSTS_PAGE_SIZE,
  siteRefSchema,
  translationGaps,
} from "@faridalms/domain/website";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  publicProcedure,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { publishMedia, withPublicSite, withdrawMedia } from "../core/site";

const id = v.pipe(v.string(), v.uuid());

const DEFAULT_SETTINGS = {
  id: "",
  version: 0,
  live: false,
  primaryLocale: "en" as SiteLocale,
  bilingual: true,
  taglineEn: "",
  taglineAr: "",
  socialLinks: [],
  bannerEn: "",
  bannerAr: "",
  bannerTone: "info" as const,
  bannerUntil: null,
  theme: defaultTheme(),
  chrome: emptyChrome(),
};

/** Stored theme and chrome read through their schemas, so new fields get their defaults. */
function normalised<T extends { theme: unknown; chrome: unknown }>(row: T) {
  return {
    ...row,
    theme: parsed(siteThemeSchema, row.theme, defaultTheme()),
    chrome: parsed(siteChromeSchema, row.chrome, emptyChrome()),
  };
}

async function settingsFor(context: UnitContext) {
  const row = await siteSettings(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  return row ? normalised(row) : DEFAULT_SETTINGS;
}

const otherLocale = (locale: SiteLocale): SiteLocale =>
  locale === "en" ? "ar" : "en";

const titleIn = (
  row: { titleEn: string; titleAr: string },
  locale: SiteLocale,
  primary: SiteLocale,
) => {
  const pick = (which: SiteLocale) =>
    which === "ar" ? row.titleAr : row.titleEn;
  return pick(locale) || pick(primary) || pick(otherLocale(primary));
};

const conflict = () =>
  new ORPCError("CONFLICT", { message: "conflict.version" });

async function pageOfSchool(context: UnitContext, pageId: string) {
  requireCapability(context, "site:manage");
  const row = await pageById(context.tx, context.tenantId, pageId);
  if (!row || row.orgId !== context.schoolId) throw new ORPCError("NOT_FOUND");
  return row;
}

async function postOfSchool(context: UnitContext, postId: string) {
  requireCapability(context, "site:manage");
  const row = await postById(context.tx, context.tenantId, postId);
  if (!row || row.orgId !== context.schoolId) throw new ORPCError("NOT_FOUND");
  return row;
}

const pageHost = (pageId: string) => ({ type: "site_page", id: pageId });
const postHost = (postId: string) => ({ type: "site_post", id: postId });

function parsed<T>(
  schema: v.GenericSchema<unknown, T>,
  content: unknown,
  fallback: T,
): T {
  const result = v.safeParse(schema, content);
  return result.success ? result.output : fallback;
}

const EMPTY_PAGE: PageContent = { sections: [], description: "", reviewed: [] };

async function pageDocuments(context: UnitContext, pageId: string) {
  const original = await documentOf(
    context.tx,
    context.tenantId,
    pageHost(pageId),
  );
  const translation = original
    ? await translationOf(context.tx, context.tenantId, original.id)
    : null;
  return {
    originalId: original?.id ?? null,
    translationId: translation?.id ?? null,
    revision: `${original?.version ?? 0}.${translation?.version ?? 0}`,
    content: parsed(pageContentSchema, original?.content, EMPTY_PAGE),
    translation: translation
      ? parsed(pageContentSchema, translation.content, EMPTY_PAGE)
      : null,
  };
}

async function postDocuments(context: UnitContext, postId: string) {
  const original = await documentOf(
    context.tx,
    context.tenantId,
    postHost(postId),
  );
  const translation = original
    ? await translationOf(context.tx, context.tenantId, original.id)
    : null;
  const empty: PostContent = {
    body: { root: { type: "root", version: 1, children: [] } },
    reviewed: false,
  };
  return {
    originalId: original?.id ?? null,
    translationId: translation?.id ?? null,
    revision: `${original?.version ?? 0}.${translation?.version ?? 0}`,
    content: parsed(postContentSchema, original?.content, empty),
    translation: translation
      ? parsed(postContentSchema, translation.content, empty)
      : null,
  };
}

/** The languages a site publishes in: its first, and the other when bilingual. */
function localesOf(settings: {
  primaryLocale: SiteLocale;
  bilingual: boolean;
}): SiteLocale[] {
  return settings.bilingual
    ? [settings.primaryLocale, otherLocale(settings.primaryLocale)]
    : [settings.primaryLocale];
}

async function history(
  context: UnitContext,
  ids: { originalId: string | null; translationId: string | null },
  primary: SiteLocale,
) {
  const of = async (documentId: string | null, locale: SiteLocale) =>
    documentId
      ? (await versionsOf(context.tx, context.tenantId, documentId)).map(
          (row) => ({ ...row, locale }),
        )
      : [];
  return [
    ...(await of(ids.originalId, primary)),
    ...(await of(ids.translationId, otherLocale(primary))),
  ].toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const shownState = (
  row: { state: string; publishedAt: string | null },
  now: Date,
) =>
  row.state === "published" &&
  row.publishedAt &&
  Date.parse(row.publishedAt) > now.getTime()
    ? ("scheduled" as const)
    : (row.state as "draft" | "published" | "archived");

const PREVIEW_POSTS = 6;

/**
 * Everything the website screen lists: settings, the page tree and the
 * categories, with the school's name, contact and latest posts so the
 * builder draws pages the way visitors will see them.
 */
export const overview = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "site:manage");
  const latest = (locale: SiteLocale) =>
    publicPosts(context.tx, {
      orgId: context.schoolId,
      locale,
      categoryId: null,
      limit: PREVIEW_POSTS,
      offset: 0,
    });
  const [settings, pages, categories, school, newsEn, newsAr] =
    await Promise.all([
      settingsFor(context),
      sitePages(context.tx, context.tenantId, context.schoolId),
      siteCategories(context.tx, context.tenantId, context.schoolId),
      publicSchool(context.tx, context.schoolId),
      latest("en"),
      latest("ar"),
    ]);
  const logo = settings.id
    ? await publicationsOf(context.tx, {
        tenantId: context.tenantId,
        hostType: "site_settings",
        hostId: settings.id,
      })
    : [];
  return {
    settings,
    pages: pages.map((row) => ({
      ...row,
      shown: shownState(row, context.now),
      changed: row.revisedAt !== null,
    })),
    categories,
    school: {
      nameEn: school?.nameEn ?? "",
      nameAr: school?.nameAr ?? null,
      contact: {
        address: school?.address ?? null,
        phone: school?.phone ?? null,
        email: school?.email ?? null,
      },
    },
    logoKey:
      logo.find((row) => row.fileId === settings.chrome.logoFileId)
        ?.publicKey ?? null,
    news: { en: newsEn.rows, ar: newsAr.rows },
  };
});

export const saveSettings = writeProcedure
  .input(saveSettingsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    const version = await saveSiteSettings(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ...input,
      bannerUntil: input.bannerUntil || null,
    });
    if (version === null) throw conflict();
    const saved = await siteSettings(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    if (saved)
      await publishMedia(
        context,
        {
          tenantId: context.tenantId,
          hostType: "site_settings",
          hostId: saved.id,
        },
        input.chrome.logoFileId ? [input.chrome.logoFileId] : [],
      );
    await audit(context, {
      action: "site.settings",
      objectType: "org",
      objectId: context.schoolId,
      details: {
        live: input.live,
        bilingual: input.bilingual,
        theme: input.theme.id,
      },
    });
    return { version };
  });

function issuesByLocale(
  content: PageContent,
  translation: PageContent | null,
  settings: { primaryLocale: SiteLocale; bilingual: boolean },
): Record<SiteLocale, SiteIssue[]> {
  const found: Record<SiteLocale, SiteIssue[]> = { en: [], ar: [] };
  for (const locale of localesOf(settings))
    found[locale] = pageIssues(
      localizedSections(content, translation, settings.primaryLocale, locale)
        .filter((item) => item.locale === locale)
        .map((item) => item.section),
    );
  return found;
}

/** A page with both languages of its sections, what stops it publishing, and its history. */
export const page = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await pageOfSchool(context, input.id);
    const [settings, documents, pages] = await Promise.all([
      settingsFor(context),
      pageDocuments(context, row.id),
      sitePages(context.tx, context.tenantId, context.schoolId),
    ]);
    const below = new Set([row.id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const other of pages)
        if (
          other.parentId &&
          below.has(other.parentId) &&
          !below.has(other.id)
        ) {
          below.add(other.id);
          grew = true;
        }
    }
    return {
      ...row,
      shown: shownState(row, context.now),
      settings: {
        primaryLocale: settings.primaryLocale,
        bilingual: settings.bilingual,
      },
      revision: documents.revision,
      content: documents.content,
      translation: documents.translation,
      gaps: translationGaps(documents.content, documents.translation),
      issues: issuesByLocale(
        documents.content,
        documents.translation,
        settings,
      ),
      history: await history(context, documents, settings.primaryLocale),
      parents: pages
        .filter((other) => !below.has(other.id) && !other.isHome)
        .map((other) => ({
          id: other.id,
          title: titleIn(other, settings.primaryLocale, settings.primaryLocale),
        })),
    };
  });

async function checkParent(
  context: UnitContext,
  pageId: string,
  parentId: string | null,
) {
  if (!parentId) return;
  const pages = await sitePages(context.tx, context.tenantId, context.schoolId);
  const byId = new Map(pages.map((row) => [row.id, row]));
  const parent = byId.get(parentId);
  if (!parent || parent.isHome)
    throw new ORPCError("BAD_REQUEST", { message: "site.parent" });
  for (
    let at: PageRow | undefined = parent;
    at;
    at = at.parentId ? byId.get(at.parentId) : undefined
  )
    if (at.id === pageId)
      throw new ORPCError("BAD_REQUEST", { message: "site.parent" });
}

export const savePage = writeProcedure
  .input(savePageSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    const settings = await settingsFor(context);
    const primaryTitle =
      settings.primaryLocale === "ar" ? input.titleAr : input.titleEn;
    if (!primaryTitle)
      throw new ORPCError("BAD_REQUEST", { message: "site.title" });
    const parentId = input.parentId || null;
    const fields = {
      parentId,
      slug: input.slug,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      inMenu: input.inMenu,
    };
    let pageId = input.id;
    let version: number;
    if (input.id) {
      const row = await pageOfSchool(context, input.id);
      if (row.isHome && parentId)
        throw new ORPCError("BAD_REQUEST", { message: "site.parent" });
      if (parentId !== row.parentId)
        await checkParent(context, row.id, parentId);
      const next = await updatePage(context.tx, {
        tenantId: context.tenantId,
        id: row.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (next === null) throw conflict();
      version = next;
      if (parentId !== row.parentId) {
        await placePage(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          id: row.id,
          parentId,
          position: 999,
        });
        await syncPublishedPlaces(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
        });
        version += 1;
      }
    } else {
      await checkParent(context, "", parentId);
      const created = await insertPage(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        authorId: context.actor.userId,
        ...fields,
      });
      pageId = created.id;
      version = created.version;
    }
    const host = pageHost(pageId);
    const original = await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      kind: "page",
      locale: settings.primaryLocale,
      content: input.content,
      plainText: pagePlainText(input.content),
      mediaIds: pageFileIds(input.content),
      userId: context.actor.userId,
    });
    if (settings.bilingual && input.translation) {
      const aligned = alignTranslation(input.content, input.translation);
      await saveTranslation(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host,
        originalId: original.id,
        locale: otherLocale(settings.primaryLocale),
        kind: "page",
        content: aligned,
        plainText: pagePlainText(aligned),
        mediaIds: pageFileIds(aligned),
        userId: context.actor.userId,
      });
    } else
      await dropTranslation(context.tx, {
        tenantId: context.tenantId,
        originalId: original.id,
      });
    await audit(context, {
      action: input.id ? "site.page_update" : "site.page_create",
      objectType: "site_page",
      objectId: pageId,
      details: { slug: input.slug },
    });
    return { id: pageId, version };
  });

/**
 * Publishes a page now or at a time: every language the site speaks is
 * checked, its pictures made public, the words snapshotted, and a copy per
 * language written for visitors.
 */
export const publishPage = writeProcedure
  .input(publishSchema)
  .handler(async ({ input, context }) => {
    const row = await pageOfSchool(context, input.id);
    const settings = await settingsFor(context);
    const documents = await pageDocuments(context, row.id);
    if (!documents.originalId || documents.content.sections.length === 0)
      throw new ORPCError("CONFLICT", { message: "site.empty" });
    const issues = issuesByLocale(
      documents.content,
      documents.translation,
      settings,
    );
    if (issues.en.length + issues.ar.length > 0)
      throw new ORPCError("CONFLICT", { message: "site.issues" });
    const translation = settings.bilingual ? documents.translation : null;
    const media = await publishMedia(
      context,
      { tenantId: context.tenantId, hostType: "site_page", hostId: row.id },
      [
        ...new Set([
          ...pageFileIds(documents.content),
          ...(translation ? pageFileIds(translation) : []),
        ]),
      ],
    );
    await snapshotPublish(context.tx, {
      tenantId: context.tenantId,
      documentId: documents.originalId,
      userId: context.actor.userId,
    });
    if (translation && documents.translationId)
      await snapshotPublish(context.tx, {
        tenantId: context.tenantId,
        documentId: documents.translationId,
        userId: context.actor.userId,
      });
    const publishedAt = input.publishAt || context.now.toISOString();
    const version = await setPageState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: "published",
      publishedAt,
    });
    if (version === null) throw conflict();
    await withdrawPage(context.tx, {
      tenantId: context.tenantId,
      pageId: row.id,
    });
    for (const locale of localesOf(settings))
      await writePublishedPage(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        page: row,
        locale,
        title: titleIn(row, locale, settings.primaryLocale),
        content: {
          sections: localizedSections(
            documents.content,
            translation,
            settings.primaryLocale,
            locale,
          ),
          description:
            (locale !== settings.primaryLocale && translation?.description) ||
            documents.content.description,
        },
        media,
        visibleFrom: publishedAt,
      });
    await audit(context, {
      action: "site.page_publish",
      objectType: "site_page",
      objectId: row.id,
      details: { publishedAt },
    });
    return { version };
  });

export const unpublishPage = writeProcedure
  .input(siteRefSchema)
  .handler(async ({ input, context }) => {
    const row = await pageOfSchool(context, input.id);
    const version = await setPageState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: "draft",
      publishedAt: null,
    });
    if (version === null) throw conflict();
    await withdrawPage(context.tx, {
      tenantId: context.tenantId,
      pageId: row.id,
    });
    await withdrawMedia(context, {
      tenantId: context.tenantId,
      hostType: "site_page",
      hostId: row.id,
    });
    await audit(context, {
      action: "site.page_unpublish",
      objectType: "site_page",
      objectId: row.id,
    });
    return { version };
  });

export const movePage = writeProcedure
  .input(movePageSchema)
  .handler(async ({ input, context }) => {
    const row = await pageOfSchool(context, input.id);
    const parentId = input.parentId || null;
    if (row.isHome && parentId)
      throw new ORPCError("BAD_REQUEST", { message: "site.parent" });
    await checkParent(context, row.id, parentId);
    await placePage(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: row.id,
      parentId,
      position: input.position,
    });
    await syncPublishedPlaces(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
    });
    return { moved: true };
  });

export const removeSitePage = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await pageOfSchool(context, input.id);
    if (row.isHome) throw new ORPCError("CONFLICT", { message: "site.home" });
    const pages = await sitePages(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    if (pages.some((other) => other.parentId === row.id))
      throw new ORPCError("CONFLICT", { message: "site.has_children" });
    await withdrawPage(context.tx, {
      tenantId: context.tenantId,
      pageId: row.id,
    });
    await withdrawMedia(context, {
      tenantId: context.tenantId,
      hostType: "site_page",
      hostId: row.id,
    });
    await removePage(context.tx, { tenantId: context.tenantId, id: row.id });
    await audit(context, {
      action: "site.page_delete",
      objectType: "site_page",
      objectId: row.id,
      details: { slug: row.slug },
    });
    return { removed: true };
  });

/** Brings an earlier version of one language back as the page's working copy. */
export const restorePage = writeProcedure
  .input(restoreSchema)
  .handler(async ({ input, context }) => {
    const row = await pageOfSchool(context, input.id);
    const settings = await settingsFor(context);
    const documents = await pageDocuments(context, row.id);
    const primary = input.locale === settings.primaryLocale;
    const documentId = primary ? documents.originalId : documents.translationId;
    if (!documentId || !documents.originalId) throw new ORPCError("NOT_FOUND");
    const restored = await contentToRestore(context.tx, {
      tenantId: context.tenantId,
      documentId,
      documentVersion: input.documentVersion,
      userId: context.actor.userId,
    });
    if (!restored) throw new ORPCError("NOT_FOUND");
    const content = parsed(pageContentSchema, restored, EMPTY_PAGE);
    const host = pageHost(row.id);
    if (primary)
      await saveDocument(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host,
        kind: "page",
        locale: settings.primaryLocale,
        content,
        plainText: pagePlainText(content),
        mediaIds: pageFileIds(content),
        userId: context.actor.userId,
      });
    else {
      const aligned = alignTranslation(documents.content, content);
      await saveTranslation(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host,
        originalId: documents.originalId,
        locale: input.locale,
        kind: "page",
        content: aligned,
        plainText: pagePlainText(aligned),
        mediaIds: pageFileIds(aligned),
        userId: context.actor.userId,
      });
    }
    await markRevised(context.tx, {
      tenantId: context.tenantId,
      kind: "page",
      id: row.id,
    });
    await audit(context, {
      action: "site.page_restore",
      objectType: "site_page",
      objectId: row.id,
      details: { locale: input.locale, documentVersion: input.documentVersion },
    });
    return { restored: true };
  });

export const saveSiteCategory = writeProcedure
  .input(saveCategorySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    if (!input.nameEn && !input.nameAr)
      throw new ORPCError("BAD_REQUEST", { message: "site.title" });
    const saved = await saveCategory(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ...input,
    });
    if (!saved) throw conflict();
    return saved;
  });

export const removeSiteCategory = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    if (
      !(await removeCategory(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: input.id,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    return { removed: true };
  });

export const posts = readProcedure
  .input(postsQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    return sitePosts(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ...input,
    });
  });

function postIssuesByLocale(
  row: PostRow,
  content: PostContent,
  translation: PostContent | null,
  settings: { primaryLocale: SiteLocale; bilingual: boolean },
) {
  const found: Record<SiteLocale, string[]> = { en: [], ar: [] };
  for (const locale of localesOf(settings)) {
    const translated = locale !== settings.primaryLocale;
    if (translated && !translation) continue;
    found[locale] = postIssues({
      coverFileId: row.coverFileId,
      coverAlt: locale === "ar" ? row.coverAltAr : row.coverAltEn,
      body: (translated && translation ? translation : content).body,
    });
  }
  return found;
}

export const post = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await postOfSchool(context, input.id);
    const [settings, documents, categories] = await Promise.all([
      settingsFor(context),
      postDocuments(context, row.id),
      siteCategories(context.tx, context.tenantId, context.schoolId),
    ]);
    return {
      ...row,
      shown: shownState(row, context.now),
      settings: {
        primaryLocale: settings.primaryLocale,
        bilingual: settings.bilingual,
      },
      revision: documents.revision,
      content: documents.content,
      translation: documents.translation,
      issues: postIssuesByLocale(
        row,
        documents.content,
        documents.translation,
        settings,
      ),
      history: await history(context, documents, settings.primaryLocale),
      categories: categories.map((category) => ({
        id: category.id,
        nameEn: category.nameEn,
        nameAr: category.nameAr,
      })),
    };
  });

export const postOptions = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "site:manage");
  const [settings, categories] = await Promise.all([
    settingsFor(context),
    siteCategories(context.tx, context.tenantId, context.schoolId),
  ]);
  return {
    settings: {
      primaryLocale: settings.primaryLocale,
      bilingual: settings.bilingual,
    },
    categories: categories.map((category) => ({
      id: category.id,
      nameEn: category.nameEn,
      nameAr: category.nameAr,
    })),
  };
});

const postMedia = (content: PostContent, coverFileId: string | null) => [
  ...new Set([
    ...contentFileIds(content.body),
    ...(coverFileId ? [coverFileId] : []),
  ]),
];

export const savePost = writeProcedure
  .input(savePostSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    const settings = await settingsFor(context);
    const primaryTitle =
      settings.primaryLocale === "ar" ? input.titleAr : input.titleEn;
    if (!primaryTitle)
      throw new ORPCError("BAD_REQUEST", { message: "site.title" });
    const fields = {
      categoryId: input.categoryId || null,
      slug: input.slug,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      excerptEn: input.excerptEn,
      excerptAr: input.excerptAr,
      coverFileId: input.coverFileId || null,
      coverAltEn: input.coverAltEn,
      coverAltAr: input.coverAltAr,
      pinned: input.pinned,
    };
    let postId = input.id;
    let version: number;
    if (input.id) {
      const row = await postOfSchool(context, input.id);
      const next = await updatePost(context.tx, {
        tenantId: context.tenantId,
        id: row.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (next === null) throw conflict();
      version = next;
    } else {
      const created = await insertPost(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        authorId: context.actor.userId,
        ...fields,
      });
      postId = created.id;
      version = created.version;
    }
    const host = postHost(postId);
    const original = await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      kind: "rich_text",
      locale: settings.primaryLocale,
      content: input.content,
      plainText: contentPlainText(input.content.body),
      mediaIds: postMedia(input.content, fields.coverFileId),
      userId: context.actor.userId,
    });
    if (settings.bilingual && input.translation)
      await saveTranslation(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host,
        originalId: original.id,
        locale: otherLocale(settings.primaryLocale),
        kind: "rich_text",
        content: input.translation,
        plainText: contentPlainText(input.translation.body),
        mediaIds: postMedia(input.translation, null),
        userId: context.actor.userId,
      });
    else
      await dropTranslation(context.tx, {
        tenantId: context.tenantId,
        originalId: original.id,
      });
    await audit(context, {
      action: input.id ? "site.post_update" : "site.post_create",
      objectType: "site_post",
      objectId: postId,
      details: { slug: input.slug },
    });
    return { id: postId, version };
  });

export const publishPost = writeProcedure
  .input(publishPostSchema)
  .handler(async ({ input, context }) => {
    const row = await postOfSchool(context, input.id);
    const settings = await settingsFor(context);
    const documents = await postDocuments(context, row.id);
    if (
      !documents.originalId ||
      !contentPlainText(documents.content.body).trim()
    )
      throw new ORPCError("CONFLICT", { message: "site.empty" });
    const issues = postIssuesByLocale(
      row,
      documents.content,
      documents.translation,
      settings,
    );
    if (issues.en.length + issues.ar.length > 0)
      throw new ORPCError("CONFLICT", { message: "site.issues" });
    const translation = settings.bilingual ? documents.translation : null;
    const media = await publishMedia(
      context,
      { tenantId: context.tenantId, hostType: "site_post", hostId: row.id },
      [
        ...new Set([
          ...postMedia(documents.content, row.coverFileId),
          ...(translation ? postMedia(translation, null) : []),
        ]),
      ],
    );
    await snapshotPublish(context.tx, {
      tenantId: context.tenantId,
      documentId: documents.originalId,
      userId: context.actor.userId,
    });
    if (translation && documents.translationId)
      await snapshotPublish(context.tx, {
        tenantId: context.tenantId,
        documentId: documents.translationId,
        userId: context.actor.userId,
      });
    const publishedAt = input.publishAt || context.now.toISOString();
    const version = await setPostState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: "published",
      publishedAt,
    });
    if (version === null) throw conflict();
    await withdrawPost(context.tx, {
      tenantId: context.tenantId,
      postId: row.id,
    });
    const primary = settings.primaryLocale;
    for (const locale of localesOf(settings)) {
      const translated = locale !== primary && translation !== null;
      const words = (en: string, ar: string) => {
        const pick = (which: SiteLocale) => (which === "ar" ? ar : en);
        return pick(locale) || pick(primary);
      };
      await writePublishedPost(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        post: row,
        locale,
        title: titleIn(row, locale, primary),
        excerpt: words(row.excerptEn, row.excerptAr),
        coverKey: row.coverFileId ? (media[row.coverFileId] ?? null) : null,
        coverAlt: words(row.coverAltEn, row.coverAltAr),
        content: {
          body: translated ? translation.body : documents.content.body,
          locale: translated ? locale : primary,
        },
        media,
        visibleFrom: publishedAt,
      });
    }
    await audit(context, {
      action: "site.post_publish",
      objectType: "site_post",
      objectId: row.id,
      details: { publishedAt },
    });
    return { version };
  });

async function takeDown(
  context: UnitContext,
  row: PostRow,
  expectedVersion: number,
  state: "draft" | "archived",
) {
  const version = await setPostState(context.tx, {
    tenantId: context.tenantId,
    id: row.id,
    expectedVersion,
    state,
    publishedAt: null,
  });
  if (version === null) throw conflict();
  await withdrawPost(context.tx, {
    tenantId: context.tenantId,
    postId: row.id,
  });
  await withdrawMedia(context, {
    tenantId: context.tenantId,
    hostType: "site_post",
    hostId: row.id,
  });
  await audit(context, {
    action: state === "archived" ? "site.post_archive" : "site.post_unpublish",
    objectType: "site_post",
    objectId: row.id,
  });
  return { version };
}

export const unpublishPost = writeProcedure
  .input(siteRefSchema)
  .handler(async ({ input, context }) =>
    takeDown(
      context,
      await postOfSchool(context, input.id),
      input.expectedVersion,
      "draft",
    ),
  );

export const archivePost = writeProcedure
  .input(siteRefSchema)
  .handler(async ({ input, context }) =>
    takeDown(
      context,
      await postOfSchool(context, input.id),
      input.expectedVersion,
      "archived",
    ),
  );

export const restorePost = writeProcedure
  .input(restoreSchema)
  .handler(async ({ input, context }) => {
    const row = await postOfSchool(context, input.id);
    const settings = await settingsFor(context);
    const documents = await postDocuments(context, row.id);
    const primary = input.locale === settings.primaryLocale;
    const documentId = primary ? documents.originalId : documents.translationId;
    if (!documentId || !documents.originalId) throw new ORPCError("NOT_FOUND");
    const restored = await contentToRestore(context.tx, {
      tenantId: context.tenantId,
      documentId,
      documentVersion: input.documentVersion,
      userId: context.actor.userId,
    });
    const content = v.safeParse(postContentSchema, restored);
    if (!content.success) throw new ORPCError("NOT_FOUND");
    const host = postHost(row.id);
    const common = {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      kind: "rich_text" as const,
      content: content.output,
      plainText: contentPlainText(content.output.body),
      userId: context.actor.userId,
    };
    if (primary)
      await saveDocument(context.tx, {
        ...common,
        locale: settings.primaryLocale,
        mediaIds: postMedia(content.output, row.coverFileId),
      });
    else
      await saveTranslation(context.tx, {
        ...common,
        originalId: documents.originalId,
        locale: input.locale,
        mediaIds: postMedia(content.output, null),
      });
    await markRevised(context.tx, {
      tenantId: context.tenantId,
      kind: "post",
      id: row.id,
    });
    return { restored: true };
  });

/**
 * Starts a site from a starter: its theme and frame, and each of its pages
 * as a draft with placeholder words in both languages. Pages whose address
 * is already taken are left as they are.
 */
export const applyStarter = writeProcedure
  .input(applyStarterSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    const settings = await settingsFor(context);
    const starter = STARTERS[input.starter];
    const existing = new Set(
      (await sitePages(context.tx, context.tenantId, context.schoolId)).map(
        (row) => row.slug,
      ),
    );
    const hasHome = (
      await sitePages(context.tx, context.tenantId, context.schoolId)
    ).some((row) => row.isHome);
    const created: string[] = [];
    for (const plan of starter.pages) {
      if (existing.has(plan.slug)) continue;
      const home = Boolean(plan.home) && !hasHome;
      const inserted = await insertPage(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        authorId: context.actor.userId,
        parentId: null,
        slug: plan.slug,
        titleEn: plan.title[0],
        titleAr: plan.title[1],
        inMenu: true,
        isHome: home,
      });
      const built = buildTemplate(plan.template, settings.primaryLocale);
      const content: PageContent = {
        sections: built.content,
        description: "",
        reviewed: [],
      };
      const host = pageHost(inserted.id);
      const original = await saveDocument(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host,
        kind: "page",
        locale: settings.primaryLocale,
        content,
        plainText: pagePlainText(content),
        mediaIds: [],
        userId: context.actor.userId,
      });
      if (settings.bilingual) {
        const translation: PageContent = {
          sections: built.translation,
          description: "",
          reviewed: [],
        };
        await saveTranslation(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          host,
          originalId: original.id,
          locale: otherLocale(settings.primaryLocale),
          kind: "page",
          content: translation,
          plainText: pagePlainText(translation),
          mediaIds: [],
          userId: context.actor.userId,
        });
      }
      created.push(inserted.id);
    }
    if (input.withTheme) {
      const version = await saveSiteSettings(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        ...settings,
        expectedVersion: settings.version,
        theme: { ...settings.theme, id: starter.theme },
        chrome:
          settings.chrome.actions.length || settings.chrome.footerColumns.length
            ? settings.chrome
            : starterChrome(starter.pages),
      });
      if (version === null) throw conflict();
    }
    await audit(context, {
      action: "site.starter",
      objectType: "org",
      objectId: context.schoolId,
      details: { starter: input.starter, pages: created.length },
    });
    return { created };
  });

async function liveSettings(
  tx: UnitContext["tx"],
  tenantId: string,
  schoolId: string,
) {
  const settings = await siteSettings(tx, tenantId, schoolId);
  if (!settings?.live) throw new ORPCError("NOT_FOUND");
  return normalised(settings);
}

function resolveLocale(
  settings: { primaryLocale: SiteLocale; bilingual: boolean },
  wanted: SiteLocale | undefined,
): SiteLocale {
  return wanted && (settings.bilingual || wanted === settings.primaryLocale)
    ? wanted
    : settings.primaryLocale;
}

/** A school's website frame for visitors: names, menu, banner, links and contact. */
export const publicSite = publicProcedure
  .input(publicSiteSchema)
  .handler(({ input, context }) =>
    withPublicSite(
      context,
      input.school,
      async ({ tx, tenantId, schoolId, now }) => {
        const settings = await liveSettings(tx, tenantId, schoolId);
        const locale = resolveLocale(settings, input.locale);
        const [school, menu, categories, logo] = await Promise.all([
          publicSchool(tx, schoolId),
          publicMenu(tx, { orgId: schoolId, locale }),
          publicCategories(tx, schoolId),
          publicationsOf(tx, {
            tenantId,
            hostType: "site_settings",
            hostId: settings.id,
          }),
        ]);
        const say = (words: { en: string; ar: string }) =>
          words[locale] || words[settings.primaryLocale];
        const chrome = settings.chrome;
        if (!school) throw new ORPCError("NOT_FOUND");
        const banner =
          (locale === "ar" ? settings.bannerAr : settings.bannerEn) ||
          (settings.primaryLocale === "ar"
            ? settings.bannerAr
            : settings.bannerEn);
        const bannerOn =
          banner !== "" &&
          (!settings.bannerUntil ||
            Date.parse(settings.bannerUntil) > now.getTime());
        return {
          locale,
          primaryLocale: settings.primaryLocale,
          locales: localesOf(settings),
          name: (locale === "ar" ? school.nameAr : null) || school.nameEn,
          tagline:
            (locale === "ar" ? settings.taglineAr : settings.taglineEn) ||
            (settings.primaryLocale === "ar"
              ? settings.taglineAr
              : settings.taglineEn),
          banner: bannerOn ? { text: banner, tone: settings.bannerTone } : null,
          socialLinks: settings.socialLinks,
          theme: resolveTheme(settings.theme),
          logoKey:
            logo.find((row) => row.fileId === chrome.logoFileId)?.publicKey ??
            null,
          utility: chrome.utility.map((item) => ({
            id: item.id,
            label: say(item.label),
            href: item.href,
          })),
          actions: chrome.actions.map((item) => ({
            id: item.id,
            label: say(item.label),
            href: item.href,
            style: item.style,
          })),
          footerColumns: chrome.footerColumns.map((column) => ({
            id: column.id,
            title: say(column.title),
            links: column.links.map((item) => ({
              id: item.id,
              label: say(item.label),
              href: item.href,
            })),
          })),
          footerNote: say(chrome.footerNote),
          dock: chrome.dock,
          contact: {
            address: school.address,
            phone: school.phone,
            email: school.email,
          },
          menu,
          categories: categories.map((category) => ({
            slug: category.slug,
            name:
              (locale === "ar" ? category.nameAr : category.nameEn) ||
              category.nameEn ||
              category.nameAr,
          })),
        };
      },
    ),
  );

/** A published page for visitors, with the latest posts when it shows news. */
export const publicSitePage = publicProcedure
  .input(publicPageSchema)
  .handler(({ input, context }) =>
    withPublicSite(
      context,
      input.school,
      async ({ tx, tenantId, schoolId }) => {
        const settings = await liveSettings(tx, tenantId, schoolId);
        const locale = resolveLocale(settings, input.locale);
        const row = await publicPage(tx, {
          orgId: schoolId,
          locale,
          slug: input.slug,
        });
        if (!row) throw new ORPCError("NOT_FOUND");
        // Published copies are read through the schema, so a section
        // published before a field existed gets that field's default.
        const sections = (
          (row.content.sections ?? []) as ReturnType<typeof localizedSections>
        ).flatMap((item) => {
          const read = v.safeParse(pageSectionSchema, item.section);
          return read.success
            ? [{ section: read.output, locale: item.locale }]
            : [];
        });
        const wanted = Math.max(
          0,
          ...sections.flatMap((item) =>
            item.section.type === "news" ? [item.section.data.count] : [],
          ),
        );
        const news = wanted
          ? (
              await publicPosts(tx, {
                orgId: schoolId,
                locale,
                categoryId: null,
                limit: wanted,
                offset: 0,
              })
            ).rows
          : [];
        return {
          locale,
          title: row.title,
          isHome: row.isHome,
          sections,
          description:
            typeof row.content.description === "string"
              ? row.content.description
              : "",
          media: row.media,
          news,
        };
      },
    ),
  );

export const publicSitePosts = publicProcedure
  .input(publicPostsSchema)
  .handler(({ input, context }) =>
    withPublicSite(
      context,
      input.school,
      async ({ tx, tenantId, schoolId }) => {
        const settings = await liveSettings(tx, tenantId, schoolId);
        const locale = resolveLocale(settings, input.locale);
        const categories = await publicCategories(tx, schoolId);
        const category = input.category
          ? categories.find((item) => item.slug === input.category)
          : null;
        if (input.category && !category) throw new ORPCError("NOT_FOUND");
        const { rows, total } = await publicPosts(tx, {
          orgId: schoolId,
          locale,
          categoryId: category?.id ?? null,
          limit: SITE_POSTS_PAGE_SIZE,
          offset: (input.page - 1) * SITE_POSTS_PAGE_SIZE,
        });
        return { locale, rows, total, pageSize: SITE_POSTS_PAGE_SIZE };
      },
    ),
  );

export const publicSitePost = publicProcedure
  .input(publicPostSchema)
  .handler(({ input, context }) =>
    withPublicSite(
      context,
      input.school,
      async ({ tx, tenantId, schoolId }) => {
        const settings = await liveSettings(tx, tenantId, schoolId);
        const locale = resolveLocale(settings, input.locale);
        const row = await publicPost(tx, {
          orgId: schoolId,
          locale,
          slug: input.slug,
        });
        if (!row) throw new ORPCError("NOT_FOUND");
        const { content, ...visible } = row;
        return {
          ...visible,
          locale,
          body: content.body as PostContent["body"],
          bodyLocale: (content.locale ?? locale) as SiteLocale,
        };
      },
    ),
  );
