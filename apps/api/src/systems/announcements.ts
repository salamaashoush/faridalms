import type { AnnouncementRow } from "@faridalms/database/stores/announcements";
import type { AnnouncementState } from "@faridalms/database/tables/announcements";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import {
  addRecipients,
  announcementById,
  deliveryReport,
  feedOf,
  insertAnnouncement,
  managedAnnouncements,
  markSeen,
  recipientOf,
  resetReads,
  setState,
  updateAnnouncement,
} from "@faridalms/database/stores/announcements";
import {
  audiencesOf,
  audienceUsers,
  setAudiences,
} from "@faridalms/database/stores/audiences";
import {
  documentOf,
  dropTranslation,
  saveDocument,
  saveTranslation,
  translationOf,
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
  archiveAnnouncementSchema,
  feedQuerySchema,
  manageQuerySchema,
  publishAnnouncementSchema,
  saveAnnouncementSchema,
  seenSchema,
} from "@faridalms/domain/announcements";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import {
  documentWritten,
  otherLocale,
  reviewTranslationSchema,
} from "@faridalms/domain/translations";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { audienceChoices, audienceOf } from "../core/audiences";
import { notify } from "../core/notify";
import {
  audit,
  can,
  localeOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { registerHostReader, placeMedia } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

const TAB_STATES: Record<string, AnnouncementState[]> = {
  drafts: ["draft"],
  scheduled: ["scheduled"],
  published: ["published"],
  archived: ["archived"],
};

const host = (announcementId: string) => ({
  type: "announcement",
  id: announcementId,
});

const primaryOf = (row: AnnouncementRow): ContentLocale =>
  row.primaryLocale ?? (row.titleAr && !row.titleEn ? "ar" : "en");

const titleIn = (
  row: { titleEn: string; titleAr: string },
  locale: ContentLocale,
) =>
  locale === "ar" ? row.titleAr || row.titleEn : row.titleEn || row.titleAr;

/** Rows read in a language: their title in it, the other when it has none. */
const titled =
  (context: UnitContext) =>
  <T extends { titleEn: string; titleAr: string }>(row: T) => ({
    ...row,
    title: titleIn(row, localeOf(context)),
  });

/** The two languages as they are being written. */
async function words(context: UnitContext, announcementId: string) {
  const original = await documentOf(
    context.tx,
    context.tenantId,
    host(announcementId),
  );
  const translation = original
    ? await translationOf(context.tx, context.tenantId, original.id)
    : null;
  return {
    original,
    body: (original?.content ?? null) as ContentDocument | null,
    translation: (translation?.content ?? null) as ContentDocument | null,
  };
}

/** An announcement of this school the viewer may read, or not found. */
async function readable(context: UnitContext, announcementId: string) {
  const row = await announcementById(
    context.tx,
    context.tenantId,
    announcementId,
  );
  if (!row || row.orgId !== context.schoolId) throw new ORPCError("NOT_FOUND");
  if (can(context, "announcements:manage")) return { row, recipient: null };
  const recipient = await recipientOf(context.tx, {
    tenantId: context.tenantId,
    announcementId: row.id,
    userId: context.actor.userId,
  });
  const out =
    (row.state === "published" || row.state === "scheduled") &&
    row.publishAt !== null &&
    Date.parse(row.publishAt) <= context.now.getTime();
  if (!recipient || !out) throw new ORPCError("NOT_FOUND");
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

export const feed = readProcedure
  .input(feedQuerySchema)
  .handler(async ({ input, context }) => ({
    rows: (
      await feedOf(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        viewerId: context.actor.userId,
        today: context.today,
        tab: input.tab,
        q: input.q,
      })
    ).map(titled(context)),
    canManage: can(context, "announcements:manage"),
  }));

export const manage = readProcedure
  .input(manageQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "announcements:manage");
    return {
      rows: (
        await managedAnnouncements(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          states: TAB_STATES[input.tab] ?? ["published"],
          q: input.q,
        })
      ).map(titled(context)),
    };
  });

/** The classes and grades an announcement can go to. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "announcements:manage");
  return audienceChoices(context);
});

export const editor = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "announcements:manage");
    const row = await announcementById(context.tx, context.tenantId, input.id);
    if (!row || row.orgId !== context.schoolId)
      throw new ORPCError("NOT_FOUND");
    const [audiences, written, review] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "announcement",
        id: row.id,
      }),
      words(context, row.id),
      translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "announcement",
        id: row.id,
      }),
    ]);
    return {
      ...row,
      primaryLocale: primaryOf(row),
      audiences,
      body: written.body,
      translation: written.translation,
      translationReview: review,
    };
  });

/** One announcement as its reader sees it; those who manage it see who it reached. */
export const record = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const { row, recipient } = await readable(context, input.id);
    const manages = can(context, "announcements:manage");
    const [audiences, written, report] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "announcement",
        id: row.id,
      }),
      words(context, row.id),
      manages
        ? deliveryReport(context.tx, {
            tenantId: context.tenantId,
            announcementId: row.id,
          })
        : Promise.resolve(null),
    ]);
    return {
      ...titled(context)(row),
      primaryLocale: primaryOf(row),
      audiences,
      body: written.body,
      translation: written.translation,
      readAt: recipient?.readAt ?? null,
      acknowledgedAt: recipient?.acknowledgedAt ?? null,
      canManage: manages,
      report,
    };
  });

export const save = writeProcedure
  .input(saveAnnouncementSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "announcements:manage");
    const fields = {
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      urgency: input.urgency,
      pinnedUntil: input.pinnedUntil || null,
      expiresOn: input.expiresOn || null,
      requiresAck: input.requiresAck,
      ackDueOn: input.requiresAck ? input.ackDueOn || null : null,
    };
    let announcementId = input.id;
    let version: number;
    let before: string | null = null;
    if (input.id) {
      const row = await announcementById(
        context.tx,
        context.tenantId,
        input.id,
      );
      if (!row || row.orgId !== context.schoolId)
        throw new ORPCError("NOT_FOUND");
      if (row.state === "archived")
        throw new ORPCError("CONFLICT", { message: "announcements.archived" });
      const next = await updateAnnouncement(context.tx, {
        tenantId: context.tenantId,
        id: input.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (next === null)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      version = next;
      const was = (await words(context, row.id)).translation;
      before = was ? contentPlainText(was) : null;
    } else {
      const created = await insertAnnouncement(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        authorId: context.actor.userId,
        ...fields,
      });
      announcementId = created.id;
      version = created.version;
    }
    await setAudiences(context.tx, {
      tenantId: context.tenantId,
      owner: { kind: "announcement", id: announcementId },
      audiences: input.audiences.map(audienceOf),
    });
    const original = await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host: host(announcementId),
      locale: input.primaryLocale,
      ...(await placeMedia(
        context,
        host(announcementId),
        input.body,
        contentFileIds(input.body),
      )),
      plainText: contentPlainText(input.body),
      userId: context.actor.userId,
    });
    const translated =
      input.translation && documentWritten(input.translation)
        ? input.translation
        : null;
    if (translated)
      await saveTranslation(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host: host(announcementId),
        originalId: original.id,
        locale: otherLocale(input.primaryLocale),
        kind: "rich_text",
        ...(await placeMedia(
          context,
          host(announcementId),
          translated,
          contentFileIds(translated),
        )),
        plainText: contentPlainText(translated),
        userId: context.actor.userId,
      });
    else
      await dropTranslation(context.tx, {
        tenantId: context.tenantId,
        originalId: original.id,
      });
    // A check lapses by itself once the original's words change; a translation
    // rewritten, or dropped, needs checking again.
    if (!translated || contentPlainText(translated) !== before) {
      const cleared = await reviewTranslation(context.tx, {
        tenantId: context.tenantId,
        host: "announcement",
        id: announcementId,
        userId: context.actor.userId,
        reviewed: false,
      });
      if (cleared !== null) version = cleared;
    }
    await audit(context, {
      action: input.id ? "announcement.update" : "announcement.create",
      objectType: "announcement",
      objectId: announcementId,
      details: { title: input.titleEn || input.titleAr },
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

/**
 * Sends an announcement now or at a set time, fixing who it reaches. Sending
 * an update to one already out reaches anyone newly in its audience and
 * shows it unread again; a plain save changes it quietly.
 */
export const publish = writeProcedure
  .input(publishAnnouncementSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "announcements:manage");
    const row = await announcementById(context.tx, context.tenantId, input.id);
    if (!row || row.orgId !== context.schoolId)
      throw new ORPCError("NOT_FOUND");
    if (row.state === "archived")
      throw new ORPCError("CONFLICT", { message: "announcements.archived" });
    const updating = row.state === "published";
    if (updating && !input.sendUpdate)
      throw new ORPCError("CONFLICT", { message: "announcements.already_out" });
    const later =
      input.publishAt && Date.parse(input.publishAt) > context.now.getTime();
    if (updating && later)
      throw new ORPCError("BAD_REQUEST", {
        message: "announcements.already_out",
      });
    const audiences = await audiencesOf(context.tx, context.tenantId, {
      kind: "announcement",
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
    if (users.length === 0)
      throw new ORPCError("CONFLICT", { message: "announcements.nobody" });
    const version = await setState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: later ? "scheduled" : "published",
      publishAt: updating
        ? row.publishAt
        : later
          ? input.publishAt
          : context.now.toISOString(),
      updateSent: updating,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    const added = await addRecipients(context.tx, {
      tenantId: context.tenantId,
      announcementId: row.id,
      userIds: users,
    });
    if (updating)
      await resetReads(context.tx, {
        tenantId: context.tenantId,
        announcementId: row.id,
      });
    // A scheduled one tells nobody yet; its readers hear when it is out.
    if (!later) {
      const { body } = await words(context, row.id);
      await notify(context, users, {
        kind: row.urgency === "urgent" ? "urgent" : "announcement",
        subject: { type: "announcement", id: row.id },
        params: {
          title: titleIn(row, "en"),
          titleAr: titleIn(row, "ar"),
          preview: body ? contentPlainText(body).slice(0, 160) : "",
          updated: updating,
        },
        needsAction: row.requiresAck,
      });
    }
    await audit(context, {
      action: updating
        ? "announcement.update_sent"
        : later
          ? "announcement.schedule"
          : "announcement.publish",
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

export const archive = writeProcedure
  .input(archiveAnnouncementSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "announcements:manage");
    const row = await announcementById(context.tx, context.tenantId, input.id);
    if (!row || row.orgId !== context.schoolId)
      throw new ORPCError("NOT_FOUND");
    const version = await setState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: "archived",
      publishAt: row.publishAt ?? context.now.toISOString(),
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "announcement.archive",
      objectType: "announcement",
      objectId: row.id,
    });
    return { version };
  });

/** A reader opened an announcement, or acknowledged it. */
export const seen = writeProcedure
  .input(seenSchema)
  .handler(async ({ input, context }) => {
    const { row, recipient } = await readable(context, input.id);
    if (!recipient) return { seen: false };
    if (input.acknowledge && !row.requiresAck)
      throw new ORPCError("BAD_REQUEST", { message: "announcements.no_ack" });
    await markSeen(context.tx, {
      tenantId: context.tenantId,
      announcementId: row.id,
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

/**
 * Records that the translation was checked against the original as it now
 * reads, or takes the check back. Only a written translation can be checked.
 */
export const review = writeProcedure
  .input(reviewTranslationSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "announcements:manage");
    const row = await announcementById(context.tx, context.tenantId, input.id);
    if (!row || row.orgId !== context.schoolId)
      throw new ORPCError("NOT_FOUND");
    if (row.version !== input.expectedVersion)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    if (
      input.reviewed &&
      !documentWritten((await words(context, row.id)).translation)
    )
      throw new ORPCError("CONFLICT", {
        message: "announcements.nothing_to_check",
      });
    const version = await reviewTranslation(context.tx, {
      tenantId: context.tenantId,
      host: "announcement",
      id: row.id,
      userId: context.actor.userId,
      reviewed: input.reviewed,
    });
    await audit(context, {
      action: input.reviewed
        ? "announcement.translation_checked"
        : "announcement.translation_unchecked",
      objectType: "announcement",
      objectId: row.id,
    });
    return {
      version: version ?? row.version,
      review: await translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "announcement",
        id: row.id,
      }),
    };
  });

/** A new draft with an announcement's settings, audience and both languages as they stand. */
export const duplicate = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "announcements:manage");
    const row = await announcementById(context.tx, context.tenantId, input.id);
    if (!row || row.orgId !== context.schoolId)
      throw new ORPCError("NOT_FOUND");
    const [audiences, written, checked] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "announcement",
        id: row.id,
      }),
      words(context, row.id),
      translationReview(context.tx, {
        tenantId: context.tenantId,
        host: "announcement",
        id: row.id,
      }),
    ]);
    const created = await insertAnnouncement(context.tx, {
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
    });
    await setAudiences(context.tx, {
      tenantId: context.tenantId,
      owner: { kind: "announcement", id: created.id },
      audiences,
    });
    if (written.original && written.body) {
      const copy = await saveDocument(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host: host(created.id),
        locale: primaryOf(row),
        content: written.original.content,
        plainText: written.original.plainText,
        mediaIds: contentFileIds(written.body),
        userId: context.actor.userId,
      });
      if (written.translation) {
        await saveTranslation(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          host: host(created.id),
          originalId: copy.id,
          locale: otherLocale(primaryOf(row)),
          kind: "rich_text",
          content: written.translation as unknown as Record<string, unknown>,
          plainText: contentPlainText(written.translation),
          mediaIds: contentFileIds(written.translation),
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
      action: "announcement.duplicate",
      objectType: "announcement",
      objectId: created.id,
      details: { from: row.id },
    });
    return created;
  });
