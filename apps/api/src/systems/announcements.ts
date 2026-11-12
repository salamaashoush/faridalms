import type {
  BroadcastFields,
  BroadcastRow,
} from "@faridalms/database/stores/broadcasts";
import type { SaveAnnouncement } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import { changeOf } from "@faridalms/database/audit";
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
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { CONTENT_ISSUE_CODE } from "@faridalms/domain/content-checks";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { paged, pageWindow } from "@faridalms/domain/paging";
import { isLater, isLive, phaseOf } from "@faridalms/domain/publication";
import {
  documentWritten,
  otherLocale,
  reviewTranslationSchema,
} from "@faridalms/domain/translations";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";
import type { LiveScope } from "../core/publication";

import {
  announcementCopies,
  copiesFor,
  copiesOf,
  firstAnnouncements,
  openedAnnouncements,
} from "../announcements/points";
import {
  audienceChoices,
  audienceInputs,
  audiencePeople,
  audiencesAt,
  saveAudiences,
} from "../core/audiences";
import { contributionsTo } from "../core/extension";
import { refuseIfHeld } from "../core/holds";
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

/** Whether a module on keeps a copy of it beyond its audience. */
async function opened(context: UnitContext, row: BroadcastRow) {
  return ((await copiesOf(context, [row.id])).get(row.id) ?? []).length > 0;
}

/**
 * An announcement the viewer may read: any for those who manage them,
 * otherwise one out that reached them or that a module opens to everyone.
 */
async function readable(context: UnitContext, announcementId: string) {
  const row = await ofSchool(context, announcementId);
  const recipient = await recipientOf(context.tx, {
    tenantId: context.tenantId,
    broadcastId: row.id,
    userId: context.actor.userId,
  });
  if (can(context, CAPABILITY)) return { row, recipient };
  if (
    !isLive(row, context.now) ||
    (!recipient && !(await opened(context, row)))
  )
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
  urgency: input.urgency,
  pinnedUntil: input.pinnedUntil || null,
  expiresOn: input.expiresOn || null,
  requiresAck: input.requiresAck,
  ackDueOn: input.requiresAck ? input.ackDueOn || null : null,
  excerptEn: input.excerptEn,
  excerptAr: input.excerptAr,
  coverFileId: input.coverFileId || null,
  coverAltEn: input.coverAltEn,
  coverAltAr: input.coverAltAr,
});

/** Rows with the keys of the copies modules keep of each. */
async function withCopies<T extends BroadcastRow>(
  context: UnitContext,
  rows: T[],
) {
  const copies = await copiesOf(
    context,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, copies: copies.get(row.id) ?? [] }));
}

/** What a person can read: those sent to them and those a module opens to everyone. */
export const feed = readProcedure
  .input(feedQuerySchema)
  .handler(async ({ input, context }) => {
    const { rows, total } = await announcementFeed(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      opened: await openedAnnouncements(context),
      today: context.today,
      tab: input.tab,
      q: input.q,
      ...pageWindow(input.page),
    });
    return {
      ...paged(
        (await withCopies(context, rows)).map(titled(context)),
        total,
        input.page,
      ),
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
      first: await firstAnnouncements(context),
      ...pageWindow(input.page),
    });
    return {
      ...paged(
        (await withCopies(context, rows)).map(titled(context)),
        counts[input.tab],
        input.page,
      ),
      counts,
    };
  });

/** Who an announcement can go to. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, CAPABILITY);
  return audienceChoices(context);
});

/** What stops the copies modules keep of it going out, in each language. */
async function copyIssues(
  context: UnitContext,
  input: {
    row: BroadcastRow;
    body: ContentDocument;
    other: ContentDocument | null;
  },
) {
  const found: Record<ContentLocale, string[]> = { en: [], ar: [] };
  for (const copy of await contributionsTo(context, announcementCopies)) {
    const issues = await copy.issues(context, input);
    found.en.push(...issues.en);
    found.ar.push(...issues.ar);
  }
  return found;
}

/** An announcement for its editor: the settings and both languages as they are being written. */
export const editor = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await managed(context, input.id);
    const [audiences, words, review, published] = await Promise.all([
      audiencesAt(context, owner(row)),
      draftWords(context, host(row)),
      translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "announcement",
        id: row.id,
      }),
      publishedWords(context, host(row)),
    ]);
    const body = words.body ?? emptyContent();
    const [shown] = await withCopies(context, [row]);
    return {
      ...titled(context)(shown ?? { ...row, copies: [] }),
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
      issues: await copyIssues(context, { row, body, other: words.other }),
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
      audiencesAt(context, owner(row)),
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
    const [kept] = await withCopies(context, [row]);
    const sends = words.original
      ? (
          await versionsOf(context.tx, context.tenantId, words.original.id)
        ).filter((version) => version.reason === "publish")
      : [];
    return {
      ...titled(context)(kept ?? { ...row, copies: [] }),
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
    const copies = await copiesFor(context, input.parts);
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
    const saved = await broadcastById(
      context.tx,
      context.tenantId,
      announcementId,
    );
    if (!saved) throw conflict();
    for (const copy of copies)
      if (copy.key in input.parts)
        await copy.save(context, { row: saved, value: input.parts[copy.key] });
    // Only one a module opens to everyone may tell nobody.
    if (input.audiences.length === 0 && !(await opened(context, saved)))
      throw new ORPCError("BAD_REQUEST", { message: "announcements.audience" });
    await saveAudiences(context, owner(target), input.audiences);
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
        ...(Object.keys(input.parts).length
          ? { parts: Object.keys(input.parts) }
          : {}),
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
  return audiencePeople(context, owner(row), context.today);
}

/**
 * What stops its words going out. Where a module keeps a copy beyond its
 * audience (the website, where they read as a page under its title and
 * their pictures' consent is checked as they go public), the module checks
 * them; inside the school they meet the one check list and consent to
 * photos shared within the school.
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
  if (await opened(context, row)) {
    const issues = await copyIssues(context, { row, body, other });
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
 * and a copy a module keeps beyond its audience is written. Sending an
 * update to one already out replaces what its readers have and reaches
 * anyone newly in its audience; told, it shows unread again, and quietly it
 * does not.
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
    // and a copy beyond its audience stands on its own with them written in.
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
    if (users.length === 0 && !(await opened(context, row)))
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
    for (const copy of await contributionsTo(context, announcementCopies))
      await copy.published(context, {
        row,
        body,
        other,
        publishedAt: publishAt,
      });
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
        recipients: users.length,
        added,
        publishAt: input.publishAt || null,
      },
    });
    return { version, recipients: users.length };
  });

/** Takes an announcement off its readers and any copy beyond them, back to a draft or into the archive. */
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
  for (const copy of await contributionsTo(context, announcementCopies))
    await copy.withdrawn(context, row);
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
      audiencesAt(context, owner(row)),
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
      urgency: row.urgency,
      pinnedUntil: null,
      expiresOn: null,
      requiresAck: row.requiresAck,
      ackDueOn: null,
      excerptEn: row.excerptEn,
      excerptAr: row.excerptAr,
      coverFileId: row.coverFileId,
      coverAltEn: row.coverAltEn,
      coverAltAr: row.coverAltAr,
    });
    for (const copy of await contributionsTo(context, announcementCopies))
      await copy.duplicated(context, { source: row, created });
    const target = host(created);
    await saveAudiences(context, owner(created), audienceInputs(audiences));
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
