import type { PostRow } from "@faridalms/database/stores/news";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { SiteLocale } from "@faridalms/domain/website";

import {
  audiencesOf,
  audienceUsers,
  setAudiences,
} from "@faridalms/database/stores/audiences";
import {
  documentOf,
  dropTranslation,
  publishedVersion,
  saveDocument,
  saveTranslation,
  snapshotPublish,
  translationOf,
  versionsOf,
} from "@faridalms/database/stores/documents";
import {
  addPostRecipients,
  insertPost,
  managedPosts,
  markPostRead,
  newsFor,
  postById,
  postRecipientOf,
  postReport,
  setPostState,
  updatePost,
} from "@faridalms/database/stores/news";
import { readSubject } from "@faridalms/database/stores/notifications";
import {
  siteCategories,
  siteSettings,
  subjectsWithoutConsent,
  withdrawPost,
  writePublishedPost,
} from "@faridalms/database/stores/site";
import {
  reviewTranslation,
  translationReview,
} from "@faridalms/database/stores/translations";
import {
  contentFileIds,
  contentPlainText,
  firstPicture,
} from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  manageNewsSchema,
  newsListSchema,
  newsRefSchema,
  publishNewsSchema,
  saveNewsSchema,
} from "@faridalms/domain/news";
import {
  documentWritten,
  otherLocale,
  reviewTranslationSchema,
} from "@faridalms/domain/translations";
import { postIssues } from "@faridalms/domain/website";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { audienceChoices, audienceOf } from "../core/audiences";
import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { sharedInliner } from "../core/shared";
import { publishMedia, withdrawMedia } from "../core/site";
import {
  placeMedia,
  registerHostReader,
  registerHostWriter,
} from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

const host = (postId: string) => ({ type: "site_post", id: postId });

const conflict = () =>
  new ORPCError("CONFLICT", { message: "conflict.version" });

async function ofSchool(context: UnitContext, postId: string) {
  const row = await postById(context.tx, context.tenantId, postId);
  if (!row || row.orgId !== context.schoolId) throw new ORPCError("NOT_FOUND");
  return row;
}

async function managed(context: UnitContext, postId: string) {
  requireCapability(context, "news:manage");
  return ofSchool(context, postId);
}

const out = (row: PostRow, now: Date) =>
  row.state === "published" &&
  row.publishedAt !== null &&
  Date.parse(row.publishedAt) <= now.getTime();

/**
 * A post the viewer may read inside the school: any for those who manage
 * news, otherwise one out that is public or reached them.
 */
async function readable(context: UnitContext, postId: string) {
  const row = await ofSchool(context, postId);
  const recipient = await postRecipientOf(context.tx, {
    tenantId: context.tenantId,
    postId: row.id,
    userId: context.actor.userId,
  });
  if (can(context, "news:manage")) return { row, recipient };
  if (!out(row, context.now) || (row.visibility !== "public" && !recipient))
    throw new ORPCError("NOT_FOUND");
  return { row, recipient };
}

registerHostReader("site_post", async (context, hostId) => {
  try {
    await readable(context, hostId);
    return true;
  } catch {
    return false;
  }
});

registerHostWriter("site_post", async (context, hostId) => {
  if (!can(context, "news:manage")) return false;
  const row = await postById(context.tx, context.tenantId, hostId);
  return row !== null && row.orgId === context.schoolId;
});

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

const bodyOf = (content: unknown): ContentDocument | null =>
  content ? (content as ContentDocument) : null;

/** The two languages as they are being written. */
async function drafts(context: UnitContext, postId: string) {
  const original = await documentOf(context.tx, context.tenantId, host(postId));
  const translation = original
    ? await translationOf(context.tx, context.tenantId, original.id)
    : null;
  return { original, translation };
}

/** The two languages as readers last received them, with whether edits wait since. */
async function edition(context: UnitContext, postId: string) {
  const { original, translation } = await drafts(context, postId);
  if (!original) return null;
  const [published, publishedTranslation] = await Promise.all([
    publishedVersion(context.tx, context.tenantId, original.id),
    translation
      ? publishedVersion(context.tx, context.tenantId, translation.id)
      : Promise.resolve(null),
  ]);
  if (!published) return null;
  return {
    body: bodyOf(published.content) ?? emptyContent(),
    translation: bodyOf(publishedTranslation?.content ?? null),
    changedSince:
      original.version > published.documentVersion ||
      (translation !== null &&
        translation.version > (publishedTranslation?.documentVersion ?? 0)),
  };
}

const primaryOf = (row: PostRow): ContentLocale => row.primaryLocale ?? "en";

/** A post out later than now reads as scheduled. */
const shownState = (row: PostRow, now: Date) =>
  row.state === "published" &&
  row.publishedAt !== null &&
  Date.parse(row.publishedAt) > now.getTime()
    ? ("scheduled" as const)
    : row.state;

/** What a notice says of a post: its summary, else the start of its words. */
const summaryOf = (en: string, ar: string, words: ContentDocument | null) =>
  (en || ar || (words ? contentPlainText(words) : "")).slice(0, 160);

const titleIn = (row: PostRow, locale: ContentLocale) => {
  const pick = (which: ContentLocale) =>
    which === "ar" ? row.titleAr : row.titleEn;
  return pick(locale) || pick(primaryOf(row)) || pick(otherLocale(locale));
};

const postMedia = (body: ContentDocument, coverFileId: string | null) => [
  ...new Set([...contentFileIds(body), ...(coverFileId ? [coverFileId] : [])]),
];

/** What stops a post going out, per language it is written in. */
function issuesOf(
  row: PostRow,
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

/** What the school's readers see: posts out that are public or reached them. */
export const list = readProcedure
  .input(newsListSchema)
  .handler(async ({ input, context }) => ({
    rows: await newsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      q: input.q,
      limit: 200,
    }),
    canManage: can(context, "news:manage"),
  }));

export const manage = readProcedure
  .input(manageNewsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "news:manage");
    return managedPosts(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      tab: input.tab,
      q: input.q,
    });
  });

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
    const row = await managed(context, input.id);
    const [audiences, { original, translation }, review, published] =
      await Promise.all([
        audiencesOf(context.tx, context.tenantId, {
          kind: "site_post",
          id: row.id,
        }),
        drafts(context, row.id),
        translationReview(context.tx, {
          tenantId: context.tenantId,
          host: "site_post",
          id: row.id,
        }),
        edition(context, row.id),
      ]);
    const body = bodyOf(original?.content ?? null) ?? emptyContent();
    const other = bodyOf(translation?.content ?? null);
    return {
      ...row,
      primaryLocale: primaryOf(row),
      shown: shownState(row, context.now),
      audiences,
      body,
      translation: other,
      translationReview: review,
      changedSince: published?.changedSince ?? false,
      issues: issuesOf(row, body, other),
    };
  });

/**
 * One post as its reader sees it. Those who manage news also see a draft
 * never sent (as a preview) and who a post reached.
 */
export const record = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const { row, recipient } = await readable(context, input.id);
    const manages = can(context, "news:manage");
    const [audiences, published, report, review] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "site_post",
        id: row.id,
      }),
      edition(context, row.id),
      manages
        ? postReport(context.tx, {
            tenantId: context.tenantId,
            postId: row.id,
          })
        : Promise.resolve(null),
      manages
        ? translationReview(context.tx, {
            tenantId: context.tenantId,
            host: "site_post",
            id: row.id,
          })
        : Promise.resolve(null),
    ]);
    let shown = published;
    if (!shown && manages) {
      const { original, translation } = await drafts(context, row.id);
      shown = {
        body: bodyOf(original?.content ?? null) ?? emptyContent(),
        translation: bodyOf(translation?.content ?? null),
        changedSince: false,
      };
    }
    if (!shown) throw new ORPCError("NOT_FOUND");
    const { original } = await drafts(context, row.id);
    const sends = original
      ? (await versionsOf(context.tx, context.tenantId, original.id)).filter(
          (version) => version.reason === "publish",
        )
      : [];
    return {
      ...row,
      primaryLocale: primaryOf(row),
      shown: shownState(row, context.now),
      /** When an edition already out was last replaced for its readers. */
      updatedAt: sends.length > 1 ? (sends[0]?.createdAt ?? null) : null,
      audiences,
      body: shown.body,
      translation: shown.translation,
      translationReview: review,
      preview: published === null,
      changedSince: shown.changedSince,
      readAt: recipient?.readAt ?? null,
      canManage: manages,
      report,
    };
  });

export const save = writeProcedure
  .input(saveNewsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "news:manage");
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
      visibility: input.visibility,
    };
    let postId = input.id;
    let version: number;
    let keepFiles: string[] = [];
    let before: { plainText: string } | null = null;
    if (input.id) {
      const row = await managed(context, input.id);
      if (row.state === "archived")
        throw new ORPCError("CONFLICT", { message: "news.archived" });
      const next = await updatePost(context.tx, {
        tenantId: context.tenantId,
        id: row.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (next === null) throw conflict();
      version = next;
      before = (await drafts(context, row.id)).translation;
      const published = await edition(context, row.id);
      // What readers already have must keep its pictures while edits wait.
      if (published)
        keepFiles = [
          ...contentFileIds(published.body),
          ...(published.translation
            ? contentFileIds(published.translation)
            : []),
        ];
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
    await setAudiences(context.tx, {
      tenantId: context.tenantId,
      owner: { kind: "site_post", id: postId },
      audiences: input.audiences.map(audienceOf),
    });
    const placed = await placeMedia(
      context,
      host(postId),
      input.body,
      postMedia(input.body, fields.coverFileId),
    );
    const original = await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host: host(postId),
      kind: "rich_text",
      locale: input.primaryLocale,
      content: placed.content,
      plainText: contentPlainText(input.body),
      mediaIds: [...new Set([...placed.mediaIds, ...keepFiles])],
      userId: context.actor.userId,
    });
    if (input.translation && documentWritten(input.translation))
      await saveTranslation(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host: host(postId),
        originalId: original.id,
        locale: otherLocale(input.primaryLocale),
        kind: "rich_text",
        ...(await placeMedia(
          context,
          host(postId),
          input.translation,
          contentFileIds(input.translation),
        )),
        plainText: contentPlainText(input.translation),
        userId: context.actor.userId,
      });
    else
      await dropTranslation(context.tx, {
        tenantId: context.tenantId,
        originalId: original.id,
      });
    // A check lapses by itself once the original's words change; a translation
    // rewritten, or dropped, needs checking again.
    if (
      !input.translation ||
      contentPlainText(input.translation) !== (before?.plainText ?? "")
    ) {
      const cleared = await reviewTranslation(context.tx, {
        host: "site_post",
        tenantId: context.tenantId,
        id: postId,
        userId: context.actor.userId,
        reviewed: false,
      });
      if (cleared !== null) version = cleared;
    }
    await audit(context, {
      action: input.id ? "news.update" : "news.create",
      objectType: "site_post",
      objectId: postId,
      details: { slug: input.slug, visibility: input.visibility },
    });
    return {
      id: postId,
      version,
      translationReview: await translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "site_post",
        id: postId,
      }),
    };
  });

/** Writes a public post's copy in each of the website's languages for visitors. */
async function putOnWebsite(
  context: UnitContext,
  row: PostRow,
  body: ContentDocument,
  translation: ContentDocument | null,
  publishedAt: string,
) {
  const languages = await siteLanguages(context);
  const primary = primaryOf(row);
  const media = await publishMedia(
    context,
    { tenantId: context.tenantId, hostType: "site_post", hostId: row.id },
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
      post: row,
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

async function offWebsite(context: UnitContext, postId: string) {
  await withdrawPost(context.tx, { tenantId: context.tenantId, postId });
  await withdrawMedia(context, {
    tenantId: context.tenantId,
    hostType: "site_post",
    hostId: postId,
  });
}

/**
 * Sends a post now or at a set time: the words are snapshotted for readers,
 * its audience fixed and told once, and a public post is written to the
 * website. Publishing one already out replaces what readers have without
 * telling them again, and reaches anyone newly in its audience.
 */
export const publish = writeProcedure
  .input(publishNewsSchema)
  .handler(async ({ input, context }) => {
    const row = await managed(context, input.id);
    if (row.state === "archived")
      throw new ORPCError("CONFLICT", { message: "news.archived" });
    const revising = out(row, context.now);
    const later =
      input.publishAt !== "" &&
      Date.parse(input.publishAt) > context.now.getTime();
    if (revising && later)
      throw new ORPCError("BAD_REQUEST", { message: "news.already_out" });
    const { original, translation } = await drafts(context, row.id);
    const written = bodyOf(original?.content ?? null);
    if (!original || !written || !documentWritten(written))
      throw new ORPCError("CONFLICT", { message: "news.empty" });
    const translated = bodyOf(translation?.content ?? null);
    // Its readers here see shared blocks as they stand; the website's copy
    // stands on its own, so it is checked and written with them in place.
    const inline = await sharedInliner(
      context,
      translated ? [written, translated] : [written],
    );
    const body = inline(written);
    const other = translated ? inline(translated) : null;
    const issues = issuesOf(row, body, other);
    if (issues.en.length + issues.ar.length > 0)
      throw new ORPCError("CONFLICT", { message: "site.issues" });
    // The website copy is checked again as its pictures go public; a post for
    // the school is checked here against consent to photos in school news.
    if (row.visibility === "school") {
      const unconsented = await subjectsWithoutConsent(context.tx, {
        tenantId: context.tenantId,
        fileIds: [
          ...new Set([
            ...postMedia(body, row.coverFileId),
            ...(other ? postMedia(other, null) : []),
          ]),
        ],
        meaning: "photo_internal",
        on: context.today,
      });
      if (unconsented.length > 0)
        throw new ORPCError("CONFLICT", { message: "news.consent" });
    }
    const audiences = await audiencesOf(context.tx, context.tenantId, {
      kind: "site_post",
      id: row.id,
    });
    const users = await audienceUsers(
      context.tx,
      {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        on: context.today,
      },
      audiences,
    );
    if (row.visibility === "school" && users.length === 0)
      throw new ORPCError("CONFLICT", { message: "news.nobody" });
    const publishedAt =
      revising && row.publishedAt
        ? row.publishedAt
        : later
          ? input.publishAt
          : context.now.toISOString();
    const version = await setPostState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: "published",
      publishedAt,
    });
    if (version === null) throw conflict();
    await snapshotPublish(context.tx, {
      tenantId: context.tenantId,
      documentId: original.id,
      userId: context.actor.userId,
    });
    if (translation && other)
      await snapshotPublish(context.tx, {
        tenantId: context.tenantId,
        documentId: translation.id,
        userId: context.actor.userId,
      });
    if (row.visibility === "public")
      await putOnWebsite(context, row, body, other, publishedAt);
    else await offWebsite(context, row.id);
    const added = await addPostRecipients(context.tx, {
      tenantId: context.tenantId,
      postId: row.id,
      userIds: users,
    });
    if (!later && !revising && users.length > 0) {
      await notify(context, users, {
        kind: "news",
        subject: { type: "site_post", id: row.id },
        params: {
          title: titleIn(row, "en"),
          titleAr: titleIn(row, "ar"),
          preview: summaryOf(
            row.excerptEn,
            row.excerptAr,
            primaryOf(row) === "en" ? body : other,
          ),
        },
      });
    }
    await audit(context, {
      action: revising
        ? "news.revise"
        : later
          ? "news.schedule"
          : "news.publish",
      objectType: "site_post",
      objectId: row.id,
      details: {
        visibility: row.visibility,
        recipients: users.length,
        added,
        publishAt: input.publishAt || null,
      },
    });
    return { version, recipients: users.length };
  });

/**
 * Records that the translation was checked against the original as it now
 * reads, or takes the check back. Only a written translation can be checked.
 */
export const review = writeProcedure
  .input(reviewTranslationSchema)
  .handler(async ({ input, context }) => {
    const row = await managed(context, input.id);
    if (row.version !== input.expectedVersion) throw conflict();
    const { translation } = await drafts(context, row.id);
    if (
      input.reviewed &&
      !documentWritten(bodyOf(translation?.content ?? null))
    )
      throw new ORPCError("CONFLICT", { message: "news.nothing_to_check" });
    const version = await reviewTranslation(context.tx, {
      host: "site_post",
      tenantId: context.tenantId,
      id: row.id,
      userId: context.actor.userId,
      reviewed: input.reviewed,
    });
    await audit(context, {
      action: input.reviewed
        ? "news.translation_checked"
        : "news.translation_unchecked",
      objectType: "site_post",
      objectId: row.id,
    });
    return {
      version: version ?? row.version,
      review: await translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "site_post",
        id: row.id,
      }),
    };
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
  await offWebsite(context, row.id);
  await audit(context, {
    action: state === "archived" ? "news.archive" : "news.unpublish",
    objectType: "site_post",
    objectId: row.id,
  });
  return { version };
}

export const unpublish = writeProcedure
  .input(newsRefSchema)
  .handler(async ({ input, context }) =>
    takeDown(
      context,
      await managed(context, input.id),
      input.expectedVersion,
      "draft",
    ),
  );

export const archive = writeProcedure
  .input(newsRefSchema)
  .handler(async ({ input, context }) =>
    takeDown(
      context,
      await managed(context, input.id),
      input.expectedVersion,
      "archived",
    ),
  );

/** A new draft with a post's words, picture, audience and both languages as they stand. */
export const duplicate = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await managed(context, input.id);
    const [audiences, { original, translation }, checked] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "site_post",
        id: row.id,
      }),
      drafts(context, row.id),
      translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "site_post",
        id: row.id,
      }),
    ]);
    const created = await insertPost(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      authorId: context.actor.userId,
      categoryId: row.categoryId,
      slug: `${row.slug.slice(0, 60)}-${Date.now().toString(36)}`,
      titleEn: row.titleEn,
      titleAr: row.titleAr,
      excerptEn: row.excerptEn,
      excerptAr: row.excerptAr,
      coverFileId: row.coverFileId,
      coverAltEn: row.coverAltEn,
      coverAltAr: row.coverAltAr,
      pinned: false,
      visibility: row.visibility,
    });
    await setAudiences(context.tx, {
      tenantId: context.tenantId,
      owner: { kind: "site_post", id: created.id },
      audiences,
    });
    if (original) {
      const body = bodyOf(original.content) ?? emptyContent();
      const copy = await saveDocument(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host: host(created.id),
        kind: "rich_text",
        locale: original.locale ?? primaryOf(row),
        content: original.content,
        plainText: original.plainText,
        mediaIds: postMedia(body, row.coverFileId),
        userId: context.actor.userId,
      });
      const other = bodyOf(translation?.content ?? null);
      if (translation && other) {
        await saveTranslation(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          host: host(created.id),
          originalId: copy.id,
          locale: otherLocale(original.locale ?? primaryOf(row)),
          kind: "rich_text",
          content: translation.content,
          plainText: translation.plainText,
          mediaIds: contentFileIds(other),
          userId: context.actor.userId,
        });
        if (checked?.current) {
          const version = await reviewTranslation(context.tx, {
            host: "site_post",
            tenantId: context.tenantId,
            id: created.id,
            userId: context.actor.userId,
            reviewed: true,
          });
          if (version !== null) created.version = version;
        }
      }
    }
    await audit(context, {
      action: "news.duplicate",
      objectType: "site_post",
      objectId: created.id,
      details: { from: row.id },
    });
    return created;
  });

/** A reader opened a post. */
export const seen = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const { row, recipient } = await readable(context, input.id);
    if (!recipient) return { seen: false };
    await markPostRead(context.tx, {
      tenantId: context.tenantId,
      postId: row.id,
      userId: context.actor.userId,
    });
    await readSubject(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      subjectType: "site_post",
      subjectId: row.id,
    });
    return { seen: true };
  });
