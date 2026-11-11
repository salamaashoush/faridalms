import type {
  BroadcastFields,
  BroadcastRow,
} from "@faridalms/database/stores/broadcasts";
import type { SaveAnnouncement } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { SiteLocale } from "@faridalms/domain/website";

import { changeOf } from "@faridalms/database/audit";
import {
  audiencesOf,
  audienceUsers,
  setAudiences,
} from "@faridalms/database/stores/audiences";
import {
  addRecipients,
  announcementFeed,
  broadcastById,
  deliveryCounts,
  deliveryReport,
  insertBroadcast,
  liveUntold,
  managedBroadcasts,
  markSeen,
  markTold,
  recipientOf,
  recipientsOf,
  resetReads,
  setBroadcastState,
  updateBroadcast,
} from "@faridalms/database/stores/broadcasts";
import {
  saveDocument,
  saveTranslation,
  versionsOf,
} from "@faridalms/database/stores/documents";
import {
  markActed,
  readSubject,
} from "@faridalms/database/stores/notifications";
import {
  siteCategories,
  siteSettings,
  withdrawPost,
  writePublishedPost,
} from "@faridalms/database/stores/site";
import {
  reviewTranslation,
  translationReview,
} from "@faridalms/database/stores/translations";
import {
  announcementRefSchema,
  feedQuerySchema,
  manageQuerySchema,
  publishAnnouncementSchema,
  reportQuerySchema,
  saveAnnouncementSchema,
  seenSchema,
} from "@faridalms/domain/announcements";
import {
  contentFileIds,
  contentPlainText,
  firstPicture,
} from "@faridalms/domain/content";
import { CONTENT_ISSUE_CODE } from "@faridalms/domain/content-checks";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { paged, pageWindow } from "@faridalms/domain/paging";
import { isLater, isLive, phaseOf } from "@faridalms/domain/publication";
import {
  documentWritten,
  otherLocale,
  reviewTranslationSchema,
} from "@faridalms/domain/translations";
import { postIssues } from "@faridalms/domain/website";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";
import type { LiveScope } from "../core/publication";

import { audienceChoices, audienceOf } from "../core/audiences";
import { refuseIfHeld } from "../core/holds";
import { modulesOf } from "../core/modules";
import { notify, notifyIn } from "../core/notify";
import {
  audit,
  can,
  localeOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import {
  draftWords,
  publishedWords,
  publishWords,
  registerGoLive,
  saveWords,
  tellLive,
  wordsIssues,
} from "../core/publication";
import { sharedInliner } from "../core/shared";
import { publishMedia, withdrawMedia } from "../core/site";
import { checkTranslation } from "../core/translation-review";
import { registerHostReader, registerHostWriter } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

const CAPABILITY = "announcements:manage";

const AUDIT_ACTIONS = {
  create: "announcement.create",
  update: "announcement.update",
  revise: "announcement.update_sent",
  schedule: "announcement.schedule",
  publish: "announcement.publish",
  archive: "announcement.archive",
  unpublish: "announcement.unpublish",
  duplicate: "announcement.duplicate",
} as const;

const host = (row: { id: string }) => ({
  type: "announcement" as const,
  id: row.id,
});

const owner = (row: { id: string }) => ({
  kind: "broadcast" as const,
  id: row.id,
});

const primaryOf = (row: BroadcastRow): ContentLocale =>
  row.primaryLocale ?? (row.titleAr && !row.titleEn ? "ar" : "en");

/** Its title in a language, else in its own, else in the other. */
const titleIn = (row: BroadcastRow, locale: ContentLocale) => {
  const pick = (which: ContentLocale) =>
    which === "ar" ? row.titleAr : row.titleEn;
  return pick(locale) || pick(primaryOf(row)) || pick(otherLocale(locale));
};

/** Rows read in the viewer's language. */
const titled =
  (context: UnitContext) =>
  <T extends BroadcastRow>(row: T) => ({
    ...row,
    title: titleIn(row, localeOf(context)),
    shown: phaseOf(row, context.now),
  });

const conflict = () =>
  new ORPCError("CONFLICT", { message: "conflict.version" });

/** An announcement at this school, or not found. */
async function ofSchool(context: UnitContext, announcementId: string) {
  const row = await broadcastById(context.tx, context.tenantId, announcementId);
  if (!row || row.orgId !== context.schoolId) throw new ORPCError("NOT_FOUND");
  return row;
}

async function managed(context: UnitContext, announcementId: string) {
  requireCapability(context, CAPABILITY);
  return ofSchool(context, announcementId);
}

/**
 * An announcement the viewer may read: any for those who manage them,
 * otherwise one out that reached them or is on the website.
 */
async function readable(context: UnitContext, announcementId: string) {
  const row = await ofSchool(context, announcementId);
  const recipient = await recipientOf(context.tx, {
    tenantId: context.tenantId,
    broadcastId: row.id,
    userId: context.actor.userId,
  });
  if (can(context, CAPABILITY)) return { row, recipient };
  if (!isLive(row, context.now) || (row.visibility !== "public" && !recipient))
    throw new ORPCError("NOT_FOUND");
  return { row, recipient };
}

registerHostReader("announcement", async (context, hostId) => {
  try {
    await readable(context, hostId);
    return true;
  } catch {
    return false;
  }
});
registerHostWriter("announcement", async (context, hostId) => {
  if (!can(context, CAPABILITY)) return false;
  const row = await broadcastById(context.tx, context.tenantId, hostId);
  return row !== null && row.orgId === context.schoolId;
});

/** What a notice of it going out says: its summary, else the start of its words. */
function noticeOf(
  row: BroadcastRow,
  words: { body: ContentDocument | null; other: ContentDocument | null },
  updated: boolean,
) {
  const summary =
    (primaryOf(row) === "ar" ? row.excerptAr : row.excerptEn) ||
    row.excerptEn ||
    row.excerptAr ||
    (words.body ? contentPlainText(words.body) : "");
  return {
    kind:
      row.urgency === "urgent"
        ? ("urgent" as const)
        : ("announcement" as const),
    params: {
      title: titleIn(row, "en"),
      titleAr: titleIn(row, "ar"),
      preview: summary.slice(0, 160),
      updated,
    },
    needsAction: row.requiresAck,
  };
}

/** The site's languages, which an announcement on the website is published in. */
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

/** What stops one on the website going out, per language it is written in. */
function websiteIssues(
  row: Pick<BroadcastRow, "coverFileId" | "coverAltEn" | "coverAltAr">,
  primary: ContentLocale,
  body: ContentDocument,
  translation: ContentDocument | null,
) {
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
  input: Omit<
    SaveAnnouncement,
    | "id"
    | "expectedVersion"
    | "primaryLocale"
    | "body"
    | "translation"
    | "audiences"
  >,
): BroadcastFields => ({
  titleEn: input.titleEn,
  titleAr: input.titleAr,
  visibility: input.visibility,
  urgency: input.urgency,
  pinnedUntil: input.pinnedUntil || null,
  expiresOn: input.expiresOn || null,
  requiresAck: input.requiresAck,
  ackDueOn: input.requiresAck ? input.ackDueOn || null : null,
  categoryId: input.categoryId || null,
  slug: input.slug || null,
  excerptEn: input.excerptEn,
  excerptAr: input.excerptAr,
  coverFileId: input.coverFileId || null,
  coverAltEn: input.coverAltEn,
  coverAltAr: input.coverAltAr,
  pinned: input.pinned,
});

/** A website copy needs the website; a school without it keeps its announcements inside. */
async function refuseWithoutWebsite(context: UnitContext) {
  if (!(await modulesOf(context)).website)
    throw new ORPCError("FORBIDDEN", { message: "announcements.no_website" });
}

/** What a person can read: those sent to them and those on the website. */
export const feed = readProcedure
  .input(feedQuerySchema)
  .handler(async ({ input, context }) => {
    const { rows, total } = await announcementFeed(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      today: context.today,
      tab: input.tab,
      q: input.q,
      ...pageWindow(input.page),
    });
    return {
      ...paged(rows.map(titled(context)), total, input.page),
      canManage: can(context, CAPABILITY),
    };
  });

export const manage = readProcedure
  .input(manageQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, CAPABILITY);
    const { rows, counts } = await managedBroadcasts(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      tab: input.tab,
      q: input.q,
      ...pageWindow(input.page),
    });
    return {
      ...paged(rows.map(titled(context)), counts[input.tab], input.page),
      counts,
    };
  });

/**
 * Who an announcement can go to and, where the school has a website, the
 * website's categories and languages an announcement on it is written for.
 */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, CAPABILITY);
  const website = (await modulesOf(context)).website;
  const [choices, categories, languages] = await Promise.all([
    audienceChoices(context),
    website
      ? siteCategories(context.tx, context.tenantId, context.schoolId)
      : Promise.resolve([]),
    website ? siteLanguages(context) : Promise.resolve(null),
  ]);
  return {
    ...choices,
    categories: categories.map((category) => ({
      id: category.id,
      nameEn: category.nameEn,
      nameAr: category.nameAr,
    })),
    site: languages
      ? {
          primaryLocale: languages.primaryLocale,
          bilingual: languages.bilingual,
        }
      : null,
  };
});

/** An announcement for its editor: the settings and both languages as they are being written. */
export const editor = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await managed(context, input.id);
    const [audiences, words, review, published] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, owner(row)),
      draftWords(context, host(row)),
      translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "announcement",
        id: row.id,
      }),
      publishedWords(context, host(row)),
    ]);
    const body = words.body ?? emptyContent();
    return {
      ...titled(context)(row),
      primaryLocale: primaryOf(row),
      audiences,
      body,
      translation: words.other,
      translationReview: review,
      changedSince: published?.changedSince ?? false,
      /** The words its readers have, which waiting edits can go back to. */
      sent: published
        ? { body: published.body, translation: published.translation }
        : null,
      issues: websiteIssues(row, primaryOf(row), body, words.other),
    };
  });

/**
 * One announcement as its reader sees it: the copy last published. Those
 * who manage announcements also see a draft never sent, as a preview, and
 * who it reached.
 */
export const record = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const { row, recipient } = await readable(context, input.id);
    const manages = can(context, CAPABILITY);
    const [audiences, published, report, review, words] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, owner(row)),
      publishedWords(context, host(row)),
      manages
        ? deliveryCounts(context.tx, {
            tenantId: context.tenantId,
            broadcastId: row.id,
          })
        : Promise.resolve(null),
      manages
        ? translationReview(context.tx, {
            tenantId: context.tenantId,
            host: "announcement",
            id: row.id,
          })
        : Promise.resolve(null),
      draftWords(context, host(row)),
    ]);
    const shown =
      published ??
      (manages
        ? {
            body: words.body ?? emptyContent(),
            translation: words.other,
            changedSince: false,
          }
        : null);
    if (!shown) throw new ORPCError("NOT_FOUND");
    const sends = words.original
      ? (
          await versionsOf(context.tx, context.tenantId, words.original.id)
        ).filter((version) => version.reason === "publish")
      : [];
    return {
      ...titled(context)(row),
      primaryLocale: primaryOf(row),
      /** When a copy already out was last replaced for its readers. */
      updatedAt: sends.length > 1 ? (sends[0]?.createdAt ?? null) : null,
      audiences,
      body: shown.body,
      translation: shown.translation,
      translationReview: review,
      preview: published === null,
      changedSince: shown.changedSince,
      readAt: recipient?.readAt ?? null,
      acknowledgedAt: recipient?.acknowledgedAt ?? null,
      canManage: manages,
      report,
    };
  });

/** A page of whom an announcement reached. */
export const report = readProcedure
  .input(reportQuerySchema)
  .handler(async ({ input, context }) => {
    const row = await managed(context, input.id);
    const { rows, total } = await deliveryReport(context.tx, {
      tenantId: context.tenantId,
      broadcastId: row.id,
      q: input.q,
      ...pageWindow(input.page),
    });
    return paged(rows, total, input.page);
  });

/** Writes an announcement's settings, audience and words, opening one the first time. */
export const save = writeProcedure
  .input(saveAnnouncementSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, CAPABILITY);
    if (input.visibility === "public") await refuseWithoutWebsite(context);
    const fields = fieldsOf(input);
    let announcementId = input.id;
    let version: number;
    const before = input.id ? await managed(context, input.id) : null;
    if (before) {
      if (before.state === "archived")
        throw new ORPCError("CONFLICT", { message: "announcements.archived" });
      await refuseIfHeld(context, host(before));
      const next = await updateBroadcast(context.tx, {
        tenantId: context.tenantId,
        id: before.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (next === null) throw conflict();
      version = next;
    } else {
      const created = await insertBroadcast(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        authorId: context.actor.userId,
        ...fields,
      });
      announcementId = created.id;
      version = created.version;
    }
    const target = { id: announcementId };
    await setAudiences(context.tx, {
      tenantId: context.tenantId,
      owner: owner(target),
      audiences: input.audiences.map(audienceOf),
    });
    const cleared = await saveWords(context, host(target), {
      primaryLocale: input.primaryLocale,
      body: input.body,
      translation: input.translation,
      beside: fields.coverFileId ? [fields.coverFileId] : [],
      review: "announcement",
    });
    if (cleared.version !== null) version = cleared.version;
    await audit(context, {
      action: input.id ? AUDIT_ACTIONS.update : AUDIT_ACTIONS.create,
      objectType: "announcement",
      objectId: announcementId,
      details: {
        title: input.titleEn || input.titleAr,
        visibility: input.visibility,
        ...(fields.slug ? { slug: fields.slug } : {}),
      },
      change: changeOf("core.broadcasts", before, fields),
    });
    return {
      id: announcementId,
      version,
      translationReview: await translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "announcement",
        id: announcementId,
      }),
    };
  });

/** The people an announcement's audience names today. */
async function audienceOfRow(context: UnitContext, row: BroadcastRow) {
  return audienceUsers(
    context.tx,
    {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      on: context.today,
    },
    await audiencesOf(context.tx, context.tenantId, owner(row)),
  );
}

/** Writes the website's copy in each of its languages for visitors. */
async function putOnWebsite(
  context: UnitContext,
  row: BroadcastRow,
  body: ContentDocument,
  translation: ContentDocument | null,
  publishedAt: string,
) {
  if (row.slug === null)
    throw new Error(`announcement ${row.id} is on the website without a slug`);
  const languages = await siteLanguages(context);
  const primary = primaryOf(row);
  const { media, pictures } = await publishMedia(
    context,
    { tenantId: context.tenantId, hostType: "announcement", hostId: row.id },
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
    // One without a cover shows its first picture on its card.
    const picture = row.coverFileId
      ? {
          fileId: row.coverFileId,
          alt: words(row.coverAltEn, row.coverAltAr),
        }
      : firstPicture(own ?? body);
    await writePublishedPost(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      post: { ...row, slug: row.slug },
      locale,
      title: titleIn(row, locale),
      excerpt: words(row.excerptEn, row.excerptAr),
      coverKey: picture ? (media[picture.fileId] ?? null) : null,
      coverAlt: picture?.alt ?? "",
      content: {
        body: own ?? body,
        locale: own ? locale : primary,
        pictures,
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
    hostType: "announcement",
    hostId: row.id,
  });
}

/**
 * What stops its words going out. On the website they read as a page under
 * its title, and their pictures' consent is checked as they go public;
 * inside the school they meet the one check list and consent to photos
 * shared within the school.
 */
async function checkWords(
  context: UnitContext,
  row: BroadcastRow,
  body: ContentDocument,
  other: ContentDocument | null,
) {
  if (!documentWritten(body))
    throw new ORPCError("CONFLICT", { message: "announcements.empty" });
  const beside = row.coverFileId ? [row.coverFileId] : [];
  if (row.visibility === "public") {
    await refuseWithoutWebsite(context);
    const issues = websiteIssues(row, primaryOf(row), body, other);
    if (issues.en.length + issues.ar.length > 0)
      throw new ORPCError("CONFLICT", { message: "site.issues" });
    return;
  }
  const issues = await wordsIssues(context, [body, other], {
    beside,
    consent: true,
  });
  if (issues.includes("consent"))
    throw new ORPCError("CONFLICT", { message: "announcements.consent" });
  const [problem] = issues;
  if (problem)
    throw new ORPCError("BAD_REQUEST", {
      message: CONTENT_ISSUE_CODE[problem],
    });
}

/**
 * Sends an announcement now or at a set time: its words are checked and
 * snapshotted for readers, who it reaches is fixed and told once it is out,
 * and one on the website is written there. Sending an update to one already
 * out replaces what its readers have and reaches anyone newly in its
 * audience; told, it shows unread again, and quietly it does not.
 */
export const publish = writeProcedure
  .input(publishAnnouncementSchema)
  .handler(async ({ input, context }) => {
    const row = await managed(context, input.id);
    if (row.state === "archived")
      throw new ORPCError("CONFLICT", { message: "announcements.archived" });
    const out = isLive(row, context.now);
    const later = isLater(input.publishAt, context.now);
    if (out && !input.sendUpdate)
      throw new ORPCError("CONFLICT", { message: "announcements.already_out" });
    if (out && later)
      throw new ORPCError("BAD_REQUEST", {
        message: "announcements.already_out",
      });
    const telling = !later && (!out || !input.quietly);
    const words = await draftWords(context, host(row));
    // Readers see shared blocks as they stand, so they are checked in place,
    // and a website copy stands on its own with them written into it.
    const inline = await sharedInliner(
      context,
      [words.body, words.other].filter(
        (document): document is ContentDocument => document !== null,
      ),
    );
    const body = inline(words.body ?? emptyContent());
    const other = words.other ? inline(words.other) : null;
    await checkWords(context, row, body, other);
    const users = await audienceOfRow(context, row);
    if (row.visibility === "school" && users.length === 0)
      throw new ORPCError("CONFLICT", { message: "announcements.nobody" });
    const publishAt =
      out && row.publishAt
        ? row.publishAt
        : later
          ? input.publishAt
          : context.now.toISOString();
    const version = await setBroadcastState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: "published",
      publishAt,
      told: later ? "later" : telling ? "now" : "keep",
      updateSent: out && telling,
    });
    if (version === null) throw conflict();
    await publishWords(context, host(row), {
      live: !later,
      title: titleIn(row, "en"),
      titleAr: titleIn(row, "ar"),
    });
    await (row.visibility === "public"
      ? putOnWebsite(context, row, body, other, publishAt)
      : offWebsite(context, row));
    const added = await addRecipients(context.tx, {
      tenantId: context.tenantId,
      broadcastId: row.id,
      userIds: users,
    });
    if (out && telling)
      await resetReads(context.tx, {
        tenantId: context.tenantId,
        broadcastId: row.id,
      });
    if (telling && users.length > 0) {
      const notice = noticeOf(row, { body, other }, out);
      await notify(context, users, {
        kind: notice.kind,
        subject: host(row),
        params: notice.params,
        needsAction: notice.needsAction,
      });
    }
    await audit(context, {
      action: out
        ? AUDIT_ACTIONS.revise
        : later
          ? AUDIT_ACTIONS.schedule
          : AUDIT_ACTIONS.publish,
      objectType: "announcement",
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

/** Takes an announcement off its readers and the website, back to a draft or into the archive. */
async function takeDown(
  context: UnitContext,
  input: { id: string; expectedVersion: number },
  state: "draft" | "archived",
) {
  const row = await managed(context, input.id);
  const version = await setBroadcastState(context.tx, {
    tenantId: context.tenantId,
    id: row.id,
    expectedVersion: input.expectedVersion,
    state,
    publishAt: state === "draft" ? null : row.publishAt,
    told: "keep",
  });
  if (version === null) throw conflict();
  await offWebsite(context, row);
  await audit(context, {
    action:
      state === "archived" ? AUDIT_ACTIONS.archive : AUDIT_ACTIONS.unpublish,
    objectType: "announcement",
    objectId: row.id,
  });
  return { version };
}

export const unpublish = writeProcedure
  .input(announcementRefSchema)
  .handler(({ input, context }) => takeDown(context, input, "draft"));

export const archive = writeProcedure
  .input(announcementRefSchema)
  .handler(({ input, context }) => takeDown(context, input, "archived"));

/**
 * Records that the translation was checked against the original as it now
 * reads, or takes the check back. Only a written translation can be checked.
 */
export const review = writeProcedure
  .input(reviewTranslationSchema)
  .handler(async ({ input, context }) => {
    const row = await managed(context, input.id);
    return checkTranslation(context, {
      host: "announcement",
      id: row.id,
      version: row.version,
      expectedVersion: input.expectedVersion,
      reviewed: input.reviewed,
      translated: documentWritten((await draftWords(context, host(row))).other),
    });
  });

/** A new draft with an announcement's settings, audience and both languages as they stand. */
export const duplicate = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await managed(context, input.id);
    const [audiences, words, checked] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, owner(row)),
      draftWords(context, host(row)),
      translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "announcement",
        id: row.id,
      }),
    ]);
    const created = await insertBroadcast(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      authorId: context.actor.userId,
      titleEn: row.titleEn,
      titleAr: row.titleAr,
      visibility: row.visibility,
      urgency: row.urgency,
      pinnedUntil: null,
      expiresOn: null,
      requiresAck: row.requiresAck,
      ackDueOn: null,
      categoryId: row.categoryId,
      slug: row.slug
        ? `${row.slug.slice(0, 60)}-${Date.now().toString(36)}`
        : null,
      excerptEn: row.excerptEn,
      excerptAr: row.excerptAr,
      coverFileId: row.coverFileId,
      coverAltEn: row.coverAltEn,
      coverAltAr: row.coverAltAr,
      pinned: false,
    });
    const target = host(created);
    await setAudiences(context.tx, {
      tenantId: context.tenantId,
      owner: owner(created),
      audiences,
    });
    if (words.original && words.body) {
      const locale = words.original.locale ?? primaryOf(row);
      const copy = await saveDocument(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host: target,
        kind: "rich_text",
        locale,
        content: words.original.content,
        plainText: words.original.plainText,
        mediaIds: [
          ...new Set([
            ...contentFileIds(words.body),
            ...(row.coverFileId ? [row.coverFileId] : []),
          ]),
        ],
        userId: context.actor.userId,
      });
      if (words.translation && words.other) {
        await saveTranslation(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          host: target,
          originalId: copy.id,
          locale: otherLocale(locale),
          kind: "rich_text",
          content: words.translation.content,
          plainText: contentPlainText(words.other),
          mediaIds: contentFileIds(words.other),
          userId: context.actor.userId,
        });
        if (checked?.current) {
          const version = await reviewTranslation(context.tx, {
            tenantId: context.tenantId,
            host: "announcement",
            id: created.id,
            userId: context.actor.userId,
            reviewed: true,
          });
          if (version !== null) created.version = version;
        }
      }
    }
    await audit(context, {
      action: AUDIT_ACTIONS.duplicate,
      objectType: "announcement",
      objectId: created.id,
      details: { from: row.id },
    });
    return created;
  });

/** A reader opened an announcement, or acknowledged one that asks for it. */
export const seen = writeProcedure
  .input(seenSchema)
  .handler(async ({ input, context }) => {
    const { row, recipient } = await readable(context, input.id);
    if (!recipient) return { seen: false };
    if (input.acknowledge && !row.requiresAck)
      throw new ORPCError("BAD_REQUEST", { message: "announcements.no_ack" });
    await markSeen(context.tx, {
      tenantId: context.tenantId,
      broadcastId: row.id,
      userId: context.actor.userId,
      acknowledge: input.acknowledge,
    });
    const subject = {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      subjectType: "announcement",
      subjectId: row.id,
    };
    await (input.acknowledge
      ? markActed(context.tx, subject)
      : readSubject(context.tx, subject));
    return { seen: true };
  });

registerGoLive<BroadcastRow>("broadcast", {
  due: (tx, input) => liveUntold(tx, input),
  schoolOf: (row) => row.orgId,
  authorOf: (row) => row.authorUserId,
  live: async (scope: LiveScope, row) => {
    const users = await recipientsOf(scope.tx, {
      tenantId: scope.tenantId,
      broadcastId: row.id,
    });
    if (users.length > 0) {
      const published = await publishedWords(scope, host(row));
      const notice = noticeOf(
        row,
        {
          body: published?.body ?? null,
          other: published?.translation ?? null,
        },
        false,
      );
      await notifyIn(scope, users, {
        kind: notice.kind,
        subject: host(row),
        params: notice.params,
        needsAction: notice.needsAction,
      });
    }
    await tellLive(scope, host(row), {
      title: titleIn(row, "en"),
      titleAr: titleIn(row, "ar"),
    });
    await markTold(scope.tx, { tenantId: scope.tenantId, id: row.id });
  },
});
