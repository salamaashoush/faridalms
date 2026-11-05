import type { BroadcastRow } from "@faridalms/database/stores/broadcasts";
import type { ContentDocument } from "@faridalms/domain/content";
import type { SaveNews } from "@faridalms/domain/news";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { SiteLocale } from "@faridalms/domain/website";

import { newsFor } from "@faridalms/database/stores/broadcasts";
import {
  siteCategories,
  siteSettings,
  withdrawPost,
  writePublishedPost,
} from "@faridalms/database/stores/site";
import {
  contentFileIds,
  contentPlainText,
  firstPicture,
} from "@faridalms/domain/content";
import {
  manageNewsSchema,
  newsListSchema,
  newsRefSchema,
  publishNewsSchema,
  saveNewsSchema,
} from "@faridalms/domain/news";
import { paged, pageWindow } from "@faridalms/domain/paging";
import {
  documentWritten,
  otherLocale,
  reviewTranslationSchema,
} from "@faridalms/domain/translations";
import { postIssues } from "@faridalms/domain/website";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { audienceChoices } from "../core/audiences";
import {
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { publishMedia, withdrawMedia } from "../core/site";
import {
  checkWords,
  defineKind,
  duplicateBroadcast,
  editorOf,
  manage as manageKind,
  primaryOf,
  publishBroadcast,
  recordOf,
  reviewBroadcast,
  saveBroadcast,
  seenBroadcast,
  takeDown,
  titleIn,
} from "./broadcasts";

const id = v.pipe(v.string(), v.uuid());

/** What a notice says of a post: its summary, else the start of its words. */
const summaryOf = (en: string, ar: string, words: ContentDocument | null) =>
  (en || ar || (words ? contentPlainText(words) : "")).slice(0, 160);

/** A news post: a broadcast that can also be on the school's website. */
const rules = defineKind({
  kind: "news",
  capability: "news:manage",
  codes: {
    archived: "news.archived",
    alreadyOut: "news.already_out",
    nobody: "news.nobody",
    consent: "news.consent",
    nothingToCheck: "news.nothing_to_check",
  },
  audit: "news",
  revised: "revise",
  notice: (row, words) => ({
    kind: "news",
    params: {
      title: titleIn(row, "en"),
      titleAr: titleIn(row, "ar"),
      preview: summaryOf(
        row.excerptEn,
        row.excerptAr,
        primaryOf(row) === "en" ? words.body : words.other,
      ),
    },
    needsAction: false,
  }),
});

/** A news post's address on the website, which every news post has. */
function slugOf(row: BroadcastRow): string {
  if (row.slug === null) throw new Error(`news post ${row.id} has no slug`);
  return row.slug;
}

/** The site's languages, which a public post is published in. */
async function siteLanguages(context: UnitContext) {
  const settings = await siteSettings(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const primary: SiteLocale = settings?.primaryLocale ?? "en";
  const bilingual = settings?.bilingual ?? true;
  return {
    primaryLocale: primary,
    bilingual,
    locales: bilingual ? [primary, otherLocale(primary)] : [primary],
  };
}

const postMedia = (body: ContentDocument, coverFileId: string | null) => [
  ...new Set([...contentFileIds(body), ...(coverFileId ? [coverFileId] : [])]),
];

/** What stops a post going out, per language it is written in. */
function issuesOf(
  row: BroadcastRow,
  body: ContentDocument,
  translation: ContentDocument | null,
) {
  const primary = primaryOf(row);
  const found: Record<ContentLocale, string[]> = { en: [], ar: [] };
  for (const locale of [primary, otherLocale(primary)]) {
    const written = locale === primary ? body : translation;
    if (!written || !documentWritten(written)) continue;
    found[locale] = postIssues({
      coverFileId: row.coverFileId,
      coverAlt: locale === "ar" ? row.coverAltAr : row.coverAltEn,
      body: written,
    });
  }
  return found;
}

const fieldsOf = (
  input: Pick<
    SaveNews,
    | "titleEn"
    | "titleAr"
    | "visibility"
    | "categoryId"
    | "slug"
    | "excerptEn"
    | "excerptAr"
    | "coverFileId"
    | "coverAltEn"
    | "coverAltAr"
    | "pinned"
  >,
) => ({
  titleEn: input.titleEn,
  titleAr: input.titleAr,
  visibility: input.visibility,
  urgency: "normal" as const,
  pinnedUntil: null,
  expiresOn: null,
  requiresAck: false,
  ackDueOn: null,
  categoryId: input.categoryId || null,
  slug: input.slug,
  excerptEn: input.excerptEn,
  excerptAr: input.excerptAr,
  coverFileId: input.coverFileId || null,
  coverAltEn: input.coverAltEn,
  coverAltAr: input.coverAltAr,
  pinned: input.pinned,
});

/** What the school's readers see, a page at a time: posts out that are public or reached them. */
export const list = readProcedure
  .input(newsListSchema)
  .handler(async ({ input, context }) => {
    const { rows, total } = await newsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      q: input.q,
      sort: input.sort,
      direction: input.direction,
      locale: input.locale,
      ...pageWindow(input.page),
    });
    return {
      ...paged(rows, total, input.page),
      canManage: can(context, "news:manage"),
    };
  });

export const manage = readProcedure
  .input(manageNewsSchema)
  .handler(({ input, context }) => manageKind(context, rules, input));

/** Audiences, categories and the website's languages a post is written against. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "news:manage");
  const [choices, categories, languages] = await Promise.all([
    audienceChoices(context),
    siteCategories(context.tx, context.tenantId, context.schoolId),
    siteLanguages(context),
  ]);
  return {
    ...choices,
    categories: categories.map((category) => ({
      id: category.id,
      nameEn: category.nameEn,
      nameAr: category.nameAr,
    })),
    site: {
      primaryLocale: languages.primaryLocale,
      bilingual: languages.bilingual,
    },
  };
});

export const editor = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const opened = await editorOf(context, rules, input.id);
    return {
      ...opened,
      issues: issuesOf(opened, opened.body, opened.translation),
    };
  });

/**
 * One post as its reader sees it. Those who manage news also see a draft
 * never sent (as a preview) and who a post reached.
 */
export const record = readProcedure
  .input(v.object({ id }))
  .handler(({ input, context }) => recordOf(context, rules, input.id));

export const save = writeProcedure
  .input(saveNewsSchema)
  .handler(({ input, context }) =>
    saveBroadcast(context, rules, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      primaryLocale: input.primaryLocale,
      body: input.body,
      translation: input.translation,
      audiences: input.audiences,
      fields: fieldsOf(input),
      details: { slug: input.slug, visibility: input.visibility },
    }),
  );

/** Writes a public post's copy in each of the website's languages for visitors. */
async function putOnWebsite(
  context: UnitContext,
  row: BroadcastRow,
  body: ContentDocument,
  translation: ContentDocument | null,
  publishedAt: string,
) {
  const languages = await siteLanguages(context);
  const primary = primaryOf(row);
  const media = await publishMedia(
    context,
    { tenantId: context.tenantId, hostType: "news", hostId: row.id },
    [
      ...new Set([
        ...postMedia(body, row.coverFileId),
        ...(translation ? postMedia(translation, null) : []),
      ]),
    ],
  );
  await withdrawPost(context.tx, {
    tenantId: context.tenantId,
    postId: row.id,
  });
  for (const locale of languages.locales) {
    const own = locale === primary ? body : translation;
    const words = (en: string, ar: string) =>
      (locale === "ar" ? ar : en) || (primary === "ar" ? ar : en);
    // A post without a cover shows its first picture on its card.
    const picture = row.coverFileId
      ? {
          fileId: row.coverFileId,
          alt: words(row.coverAltEn, row.coverAltAr),
        }
      : firstPicture(own ?? body);
    await writePublishedPost(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      post: { ...row, slug: slugOf(row) },
      locale,
      title: titleIn(row, locale),
      excerpt: words(row.excerptEn, row.excerptAr),
      coverKey: picture ? (media[picture.fileId] ?? null) : null,
      coverAlt: picture?.alt ?? "",
      content: {
        body: own ?? body,
        locale: own ? locale : primary,
      },
      media,
      visibleFrom: publishedAt,
    });
  }
}

async function offWebsite(context: UnitContext, row: BroadcastRow) {
  await withdrawPost(context.tx, {
    tenantId: context.tenantId,
    postId: row.id,
  });
  await withdrawMedia(context, {
    tenantId: context.tenantId,
    hostType: "news",
    hostId: row.id,
  });
}

/**
 * Sends a post now or at a set time: the words are snapshotted for readers,
 * its audience fixed and told once it is out, and a public post is written
 * to the website. Publishing one already out replaces what readers have
 * without telling them again, and reaches anyone newly in its audience.
 */
export const publish = writeProcedure
  .input(publishNewsSchema)
  .handler(({ input, context }) =>
    publishBroadcast(context, rules, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      publishAt: input.publishAt,
      revise: "quietly",
      check: async (row, body, other) => {
        if (!documentWritten(body))
          throw new ORPCError("CONFLICT", { message: "news.empty" });
        const issues = issuesOf(row, body, other);
        if (issues.en.length + issues.ar.length > 0)
          throw new ORPCError("CONFLICT", { message: "site.issues" });
        // The website copy is checked again as its pictures go public.
        await checkWords(context, rules, [body, other], {
          underHeading: true,
          beside: row.coverFileId ? [row.coverFileId] : [],
          consent: row.visibility === "school",
        });
      },
      website: (row, body, other, publishAt) =>
        row.visibility === "public"
          ? putOnWebsite(context, row, body, other, publishAt)
          : offWebsite(context, row),
    }),
  );

/**
 * Records that the translation was checked against the original as it now
 * reads, or takes the check back. Only a written translation can be checked.
 */
export const review = writeProcedure
  .input(reviewTranslationSchema)
  .handler(({ input, context }) => reviewBroadcast(context, rules, input));

export const unpublish = writeProcedure
  .input(newsRefSchema)
  .handler(({ input, context }) =>
    takeDown(context, rules, input, "draft", (row) => offWebsite(context, row)),
  );

export const archive = writeProcedure
  .input(newsRefSchema)
  .handler(({ input, context }) =>
    takeDown(context, rules, input, "archived", (row) =>
      offWebsite(context, row),
    ),
  );

/** A new draft with a post's words, picture, audience and both languages as they stand. */
export const duplicate = writeProcedure
  .input(v.object({ id }))
  .handler(({ input, context }) =>
    duplicateBroadcast(context, rules, input.id, (row) =>
      fieldsOf({
        titleEn: row.titleEn,
        titleAr: row.titleAr,
        visibility: row.visibility,
        categoryId: row.categoryId ?? "",
        slug: `${slugOf(row).slice(0, 60)}-${Date.now().toString(36)}`,
        excerptEn: row.excerptEn,
        excerptAr: row.excerptAr,
        coverFileId: row.coverFileId ?? "",
        coverAltEn: row.coverAltEn,
        coverAltAr: row.coverAltAr,
        pinned: false,
      }),
    ),
  );

/** A reader opened a post. */
export const seen = writeProcedure
  .input(v.object({ id }))
  .handler(({ input, context }) =>
    seenBroadcast(context, rules, { id: input.id, acknowledge: false }),
  );
