import type { PageRow } from "@faridalms/database/stores/site";
import type { StarterWork } from "@faridalms/domain/site-starters";
import type { BuiltTemplate } from "@faridalms/domain/site-templates";
import type { SiteLocale } from "@faridalms/domain/website";

import {
  documentOf,
  keepBeforeReplace,
  saveDocument,
  saveTranslation,
  translationOf,
} from "@faridalms/database/stores/documents";
import {
  insertPage,
  pageById,
  updatePage,
} from "@faridalms/database/stores/site";
import { blankPage, pagePlainText } from "@faridalms/domain/website";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { refuseIfHeld } from "../core/holds";

interface Languages {
  primaryLocale: SiteLocale;
  bilingual: boolean;
}

const pageHost = (pageId: string) => ({ type: "site_page", id: pageId });

/**
 * Writes a starter's words as a page's working copy, in the site's first
 * language and, where it speaks two, the other. What visitors read is the
 * page's published copy, which this leaves alone.
 */
async function writeStarterWords(
  context: UnitContext,
  languages: Languages,
  pageId: string,
  built: BuiltTemplate,
) {
  const host = pageHost(pageId);
  const content = blankPage(built.content);
  const original = await saveDocument(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    host,
    kind: "page",
    locale: languages.primaryLocale,
    content,
    plainText: pagePlainText(content),
    mediaIds: [],
    userId: context.actor.userId,
  });
  if (!languages.bilingual) return;
  const translation = blankPage(built.translation);
  await saveTranslation(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    host,
    originalId: original.id,
    locale: languages.primaryLocale === "ar" ? "en" : "ar",
    kind: "page",
    content: translation,
    plainText: pagePlainText(translation),
    mediaIds: [],
    userId: context.actor.userId,
  });
}

/** Makes a page from a starter's plan, as a draft with the plan's sample words. */
async function startPage(
  context: UnitContext,
  languages: Languages,
  { plan, built }: StarterWork["create"][number],
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
    indexed: true,
    isHome: home,
  });
  await writeStarterWords(context, languages, inserted.id, built);
  return inserted.id;
}

/**
 * Gives one of the school's pages a starter's words as its working copy.
 * The words it held are kept first in its history, in each language, so
 * the builder's History brings them back; a published page goes on showing
 * visitors what it last published, marked as changed, until it is
 * published again. Its address, titles and place stay its own.
 */
async function replacePage(
  context: UnitContext,
  languages: Languages,
  row: PageRow,
  built: BuiltTemplate,
) {
  const host = pageHost(row.id);
  await refuseIfHeld(context, host);
  const original = await documentOf(context.tx, context.tenantId, host);
  if (original) {
    await keepBeforeReplace(context.tx, {
      tenantId: context.tenantId,
      documentId: original.id,
      userId: context.actor.userId,
    });
    const translation = await translationOf(
      context.tx,
      context.tenantId,
      original.id,
    );
    if (translation)
      await keepBeforeReplace(context.tx, {
        tenantId: context.tenantId,
        documentId: translation.id,
        userId: context.actor.userId,
      });
  }
  await writeStarterWords(context, languages, row.id, built);
  const version = await updatePage(context.tx, {
    tenantId: context.tenantId,
    id: row.id,
    expectedVersion: row.version,
    parentId: row.parentId,
    slug: row.slug,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    inMenu: row.inMenu,
    indexed: row.indexed,
  });
  if (version === null)
    throw new ORPCError("CONFLICT", { message: "conflict.version" });
}

/**
 * Carries out a starter's work on the school's pages: new pages made, the
 * chosen pages replaced. Answers the ids of each.
 */
export async function doStarterWork(
  context: UnitContext,
  languages: Languages,
  work: StarterWork,
  hasHome: boolean,
) {
  const created: string[] = [];
  for (const planned of work.create)
    created.push(
      await startPage(
        context,
        languages,
        planned,
        Boolean(planned.plan.home) && !hasHome,
      ),
    );
  const replaced: string[] = [];
  for (const { pageId, planned } of work.replace) {
    const row = await pageById(context.tx, context.tenantId, pageId);
    if (!row || row.orgId !== context.schoolId)
      throw new ORPCError("NOT_FOUND");
    await replacePage(context, languages, row, planned.built);
    replaced.push(row.id);
  }
  return { created, replaced };
}
