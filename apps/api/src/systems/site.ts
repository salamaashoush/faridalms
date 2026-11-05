import type { PageRow } from "@faridalms/database/stores/site";
import type { ContentDocument } from "@faridalms/domain/content";
import type { StarterPage } from "@faridalms/domain/site-templates";
import type {
  PageContent,
  SiteIssue,
  SiteLocale,
} from "@faridalms/domain/website";

import { changeOf } from "@faridalms/database/audit";
import { publicIntakes } from "@faridalms/database/stores/admissions";
import {
  documentOf,
  dropTranslation,
  saveDocument,
  saveTranslation,
  snapshotPublish,
  translationOf,
} from "@faridalms/database/stores/documents";
import { publicEvents } from "@faridalms/database/stores/events";
import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  insertEnquiry,
  insertPage,
  pageById,
  placePage,
  publicCategories,
  publicMenu,
  publicPage,
  publicPost,
  publicPosts,
  publicSchool,
  recentEnquiries,
  removeCategory,
  removePage,
  saveCategory,
  saveSiteSettings,
  schoolToday,
  setPageInMenu,
  setPageState,
  siteCategories,
  sitePages,
  siteSettings,
  syncPublishedPlaces,
  updatePage,
  withdrawPage,
  writePublishedPage,
} from "@faridalms/database/stores/site";
import { readAnswers } from "@faridalms/domain/enquiries";
import { clientAddress } from "@faridalms/domain/forwarded";
import { paged, pageWindow } from "@faridalms/domain/paging";
import { phaseOf } from "@faridalms/domain/publication";
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
  enquirySchema,
  localizedSections,
  movePageSchema,
  pageBatchSchema,
  pageContentSchema,
  pageFileIds,
  pageIssues,
  pagePlainText,
  pageSectionSchema,
  publicPageSchema,
  publicPostSchema,
  publicPostsSchema,
  publicSiteSchema,
  publishSchema,
  saveCategorySchema,
  savePageSchema,
  saveSettingsSchema,
  SITE_POSTS_PAGE_SIZE,
  siteRefSchema,
  translationGaps,
} from "@faridalms/domain/website";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { announceEnquiry } from "../core/enquiries";
import { forgetFace } from "../core/portal-face";
import {
  audit,
  can,
  publicProcedure,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { attemptKey, ipPrefix } from "../core/session";
import { inlinePageShared } from "../core/shared";
import {
  logoKey,
  publishMedia,
  withWebsite,
  withdrawMedia,
} from "../core/site";
import { servesSchool } from "../core/turnstile";
import {
  placeMedia,
  registerHostReader,
  registerHostWriter,
} from "../files/authorize";

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
  if (row) return normalised(row);
  const school = await schoolProfile(context.tx, context.schoolId);
  return {
    ...DEFAULT_SETTINGS,
    primaryLocale: school?.defaultLocale ?? DEFAULT_SETTINGS.primaryLocale,
  };
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

const pageHost = (pageId: string) => ({ type: "site_page", id: pageId });

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

/** The languages a site publishes in: its first, and the other when bilingual. */
function localesOf(settings: {
  primaryLocale: SiteLocale;
  bilingual: boolean;
}): SiteLocale[] {
  return settings.bilingual
    ? [settings.primaryLocale, otherLocale(settings.primaryLocale)]
    : [settings.primaryLocale];
}

const shownState = (
  row: { state: string; publishedAt: string | null },
  now: Date,
) => phaseOf({ state: row.state, publishAt: row.publishedAt }, now);

const PREVIEW_POSTS = 6;
// Pages are written by whoever manages the site, so each of them opens the
// pictures and files the others put in.
registerHostReader("site_page", (context) =>
  Promise.resolve(can(context, "site:manage")),
);
registerHostWriter("site_page", (context) =>
  Promise.resolve(can(context, "site:manage")),
);

/** The most events an events section lists. */
const MAX_EVENTS = 12;

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
  const [settings, pages, categories, school, newsEn, newsAr, events, intakes] =
    await Promise.all([
      settingsFor(context),
      sitePages(context.tx, context.tenantId, context.schoolId),
      siteCategories(context.tx, context.tenantId, context.schoolId),
      publicSchool(context.tx, context.schoolId),
      latest("en"),
      latest("ar"),
      publicEvents(context.tx, {
        orgId: context.schoolId,
        from: context.today,
        limit: MAX_EVENTS,
      }),
      publicIntakes(context.tx, {
        orgId: context.schoolId,
        today: context.today,
      }),
    ]);
  const logo = school
    ? await logoKey(context.tx, context.tenantId, {
        id: context.schoolId,
        logoFileId: school.logoFileId,
      })
    : null;
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
    logoKey: logo,
    news: { en: newsEn.rows, ar: newsAr.rows },
    events,
    intakes,
    today: context.today,
  };
});

export const saveSettings = writeProcedure
  .input(saveSettingsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    const before = await siteSettings(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const { expectedVersion, ...fields } = {
      ...input,
      bannerUntil: input.bannerUntil || null,
    };
    const version = await saveSiteSettings(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      expectedVersion,
      ...fields,
    });
    if (version === null) throw conflict();
    forgetFace(context.school.slug);
    await audit(context, {
      action: "site.settings",
      objectType: "org",
      objectId: context.schoolId,
      details: {
        live: input.live,
        bilingual: input.bilingual,
        theme: input.theme.id,
      },
      change: changeOf("core.site_settings", before, fields),
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

/** A page with both languages of its sections and what stops it publishing. */
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
    const row = input.id ? await pageOfSchool(context, input.id) : null;
    if (row) {
      if (row.isHome && fields.parentId)
        throw new ORPCError("BAD_REQUEST", { message: "site.parent" });
      if (fields.parentId !== row.parentId)
        await checkParent(context, row.id, fields.parentId);
      const next = await updatePage(context.tx, {
        tenantId: context.tenantId,
        id: row.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (next === null) throw conflict();
      version = next;
      if (fields.parentId !== row.parentId) {
        await placePage(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          id: row.id,
          parentId: fields.parentId,
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
      ...(await placeMedia(
        context,
        host,
        input.content,
        pageFileIds(input.content),
      )),
      plainText: pagePlainText(input.content),
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
        ...(await placeMedia(context, host, aligned, pageFileIds(aligned))),
        plainText: pagePlainText(aligned),
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
  .handler(({ input, context }) => publishOne(context, input));

async function publishOne(
  context: UnitContext,
  input: { id: string; expectedVersion: number; publishAt?: string },
) {
  const row = await pageOfSchool(context, input.id);
  const settings = await settingsFor(context);
  const documents = await pageDocuments(context, row.id);
  if (!documents.originalId || documents.content.sections.length === 0)
    throw new ORPCError("CONFLICT", { message: "site.empty" });
  // Visitors read a copy that stands on its own, so the shared blocks the
  // page shows go out as they read now, checked and their pictures public.
  const content = await inlinePageShared(context, documents.content);
  const written = documents.translation
    ? await inlinePageShared(context, documents.translation)
    : null;
  const issues = issuesByLocale(content, written, settings);
  if (issues.en.length + issues.ar.length > 0)
    throw new ORPCError("CONFLICT", { message: "site.issues" });
  const translation = settings.bilingual ? written : null;
  const media = await publishMedia(
    context,
    { tenantId: context.tenantId, hostType: "site_page", hostId: row.id },
    [
      ...new Set([
        ...pageFileIds(content),
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
          content,
          translation,
          settings.primaryLocale,
          locale,
        ),
        description:
          (locale !== settings.primaryLocale && translation?.description) ||
          content.description,
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
}

export const unpublishPage = writeProcedure
  .input(siteRefSchema)
  .handler(({ input, context }) => unpublishOne(context, input));

async function unpublishOne(
  context: UnitContext,
  input: { id: string; expectedVersion: number },
) {
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
}

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
  .handler(({ input, context }) => removeOne(context, input.id));

async function removeOne(context: UnitContext, pageId: string) {
  const row = await pageOfSchool(context, pageId);
  if (row.isHome) throw new ORPCError("CONFLICT", { message: "site.home" });
  const pages = await sitePages(context.tx, context.tenantId, context.schoolId);
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
}

async function showInMenu(
  context: UnitContext,
  input: { id: string; expectedVersion: number },
  inMenu: boolean,
) {
  const row = await pageOfSchool(context, input.id);
  const version = await setPageInMenu(context.tx, {
    tenantId: context.tenantId,
    id: row.id,
    expectedVersion: input.expectedVersion,
    inMenu,
  });
  if (version === null) throw conflict();
  await audit(context, {
    action: inMenu ? "site.page_menu_show" : "site.page_menu_hide",
    objectType: "site_page",
    objectId: row.id,
  });
  return version;
}

/**
 * One action on several pages in one unit of work, so they all take it or
 * none does. The page that stops it is named, so the list can say which.
 * Pages are removed deepest first, so a page and the pages under it can go
 * together.
 */
export const batchPages = writeProcedure
  .input(pageBatchSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "site:manage");
    const tree = await sitePages(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const parentOf = new Map(tree.map((row) => [row.id, row.parentId]));
    const depth = (pageId: string): number => {
      const parent = parentOf.get(pageId);
      return parent ? depth(parent) + 1 : 0;
    };
    const pages =
      input.action === "remove"
        ? input.pages.toSorted((a, b) => depth(b.id) - depth(a.id))
        : input.pages;
    for (const target of pages) {
      try {
        if (input.action === "publish") await publishOne(context, target);
        else if (input.action === "unpublish")
          await unpublishOne(context, target);
        else if (input.action === "remove") await removeOne(context, target.id);
        else await showInMenu(context, target, input.action === "showInMenu");
      } catch (error) {
        if (!(error instanceof ORPCError)) throw error;
        throw new ORPCError(error.code, {
          message: error.message,
          data: { pageId: target.id },
        });
      }
    }
    if (input.action === "showInMenu" || input.action === "hideFromMenu")
      await syncPublishedPlaces(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
      });
    return { done: pages.length };
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

/**
 * Makes a page from a starter's plan, as a draft with the plan's placeholder
 * words in the site's languages.
 */
async function startPage(
  context: UnitContext,
  settings: { primaryLocale: SiteLocale; bilingual: boolean },
  plan: StarterPage,
  home: boolean,
): Promise<string> {
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
  return inserted.id;
}

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
    const pages = await sitePages(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const existing = new Set(pages.map((row) => row.slug));
    const hasHome = pages.some((row) => row.isHome);
    const created: string[] = [];
    for (const plan of starter.pages) {
      if (existing.has(plan.slug)) continue;
      created.push(
        await startPage(
          context,
          settings,
          plan,
          Boolean(plan.home) && !hasHome,
        ),
      );
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
    withWebsite(
      context,
      input.school,
      async ({ tx, tenantId, schoolId, portalHost, now }) => {
        const settings = await liveSettings(tx, tenantId, schoolId);
        const locale = resolveLocale(settings, input.locale);
        const [school, menu, categories] = await Promise.all([
          publicSchool(tx, schoolId),
          publicMenu(tx, { orgId: schoolId, locale }),
          publicCategories(tx, schoolId),
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
          digits: school.digits,
          timeZone: school.timeZone,
          portalHost,
          name: (locale === "ar" ? school.nameAr : null) || school.nameEn,
          tagline:
            (locale === "ar" ? settings.taglineAr : settings.taglineEn) ||
            (settings.primaryLocale === "ar"
              ? settings.taglineAr
              : settings.taglineEn),
          banner: bannerOn ? { text: banner, tone: settings.bannerTone } : null,
          socialLinks: settings.socialLinks,
          theme: resolveTheme(settings.theme),
          logoKey: await logoKey(tx, tenantId, {
            id: schoolId,
            logoFileId: school.logoFileId,
          }),
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
          /** The public key a form's challenge renders with; null where forms take none. */
          turnstileKey: context.turnstile?.siteKey ?? null,
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
    withWebsite(context, input.school, async ({ tx, tenantId, schoolId }) => {
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
      const coming = Math.max(
        0,
        ...sections.flatMap((item) =>
          item.section.type === "events" &&
          item.section.data.source === "calendar"
            ? [item.section.data.count]
            : [],
        ),
      );
      const today = await schoolToday(tx, schoolId);
      const events = coming
        ? await publicEvents(tx, {
            orgId: schoolId,
            from: today,
            limit: coming,
          })
        : [];
      // Admissions and the way in to applying read the intakes themselves.
      const intakes = sections.some(
        (item) =>
          item.section.type === "registerApply" ||
          (item.section.type === "admissions" &&
            item.section.data.source === "intakes"),
      )
        ? await publicIntakes(tx, { orgId: schoolId, today })
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
        events,
        intakes,
        today,
      };
    }),
  );

export const publicSitePosts = publicProcedure
  .input(publicPostsSchema)
  .handler(({ input, context }) =>
    withWebsite(context, input.school, async ({ tx, tenantId, schoolId }) => {
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
        ...pageWindow(input.page, SITE_POSTS_PAGE_SIZE),
      });
      return {
        locale,
        ...paged(rows, total, input.page, SITE_POSTS_PAGE_SIZE),
      };
    }),
  );

export const publicSitePost = publicProcedure
  .input(publicPostSchema)
  .handler(({ input, context }) =>
    withWebsite(context, input.school, async ({ tx, tenantId, schoolId }) => {
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
        body: content.body as ContentDocument,
        bodyLocale: (content.locale ?? locale) as SiteLocale,
      };
    }),
  );

/** Five messages an hour from one network, sixty for a whole school. */
const ENQUIRIES_PER_NETWORK = 5;
const ENQUIRIES_PER_SCHOOL = 60;
/** Faster than a person can type a name and an address. */
const MIN_FILL_MS = 2500;

/**
 * A visitor's message from a form section on a published page. A form that
 * came back filled by a script, or faster than a person can type, is
 * answered as if received and dropped, so the script learns nothing. Where
 * Turnstile is set up, its token must check out with Cloudflare first. What
 * the visitor sends is read against the form as published: the contact
 * details it asks for, and the school's own questions in the words shown.
 */
export const submitEnquiry = publicProcedure
  .input(enquirySchema)
  .handler(async ({ input, context }) => {
    const turnstile = context.turnstile;
    // Where Turnstile is set up its answer is the proof of a person. The
    // hidden field and the fill time are the fallback without it: browsers
    // autofill a field called website and fill a form in an instant, which
    // dropped real families who had passed the challenge.
    if (!turnstile && (input.website || input.elapsed < MIN_FILL_MS))
      return { received: true };
    const school = await context.directory.bySlug(input.school);
    if (!school) throw new ORPCError("NOT_FOUND");
    if (
      turnstile &&
      !(await turnstile.verify({
        token: input.turnstile,
        remoteIp: clientAddress(
          context.headers.get("x-forwarded-for"),
          context.trustedProxyHops,
        ),
        action: "enquiry",
        hostAllowed: (hostname) => servesSchool(context, school, hostname),
      }))
    )
      throw new ORPCError("BAD_REQUEST", { message: "site.challenge" });
    const received = await withWebsite(
      context,
      input.school,
      async ({ tx, tenantId, schoolId }) => {
        const settings = await liveSettings(tx, tenantId, schoolId);
        const locale = resolveLocale(settings, input.locale);
        const published = await publicPage(tx, {
          orgId: schoolId,
          locale,
          slug: input.page,
        });
        const form = (
          (published?.content.sections ?? []) as ReturnType<
            typeof localizedSections
          >
        )
          .map((item) => v.safeParse(pageSectionSchema, item.section))
          .flatMap((read) => (read.success ? [read.output] : []))
          .find((section) => section.id === input.sectionId);
        if (!published || form?.type !== "form")
          throw new ORPCError("BAD_REQUEST", { message: "site.form" });
        const asks = form.data;
        const email = asks.email === "hide" ? "" : input.email;
        const phone = asks.phone === "hide" ? "" : input.phone;
        if (
          (asks.email === "require" && !email) ||
          (asks.phone === "require" && !phone) ||
          (!email && !phone)
        )
          throw new ORPCError("BAD_REQUEST", {
            message: "validation.required",
          });
        const answers = readAnswers(asks.questions, input.answers);
        if (!answers.ok)
          throw new ORPCError("BAD_REQUEST", {
            message:
              answers.code === "required"
                ? "validation.required"
                : "validation.invalid",
            data: { questionId: answers.questionId },
          });
        const network = ipPrefix(context.headers, context.trustedProxyHops);
        const networkKey = network
          ? attemptKey(
              context.cellSecret,
              tenantId,
              `enquiry:${network}`,
            ).toString("hex")
          : "";
        const recent = await recentEnquiries(tx, {
          orgId: schoolId,
          networkKey,
        });
        if (
          recent.fromNetwork >= ENQUIRIES_PER_NETWORK ||
          recent.forSchool >= ENQUIRIES_PER_SCHOOL
        )
          throw new ORPCError("TOO_MANY_REQUESTS", {
            message: "site.too_many",
          });
        const enquiryId = Bun.randomUUIDv7();
        const message = asks.message === "hide" ? "" : input.message;
        await insertEnquiry(tx, {
          tenantId,
          id: enquiryId,
          orgId: schoolId,
          pageId: published.pageId,
          sectionId: form.id,
          locale,
          purpose: asks.purpose,
          name: input.name,
          email,
          phone,
          childName: asks.child === "hide" ? "" : input.childName,
          childYear: asks.grade === "hide" ? "" : input.childYear,
          message,
          answers: answers.answers,
          networkKey,
        });
        return { id: enquiryId, purpose: asks.purpose, message };
      },
    );
    await announceEnquiry(context, school, {
      id: received.id,
      name: input.name,
      purpose: received.purpose,
      message: received.message,
    });
    return { received: true };
  });
