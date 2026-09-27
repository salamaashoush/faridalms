import type { AnnouncementState } from "@faridalms/database/tables/announcements";
import type { ContentDocument } from "@faridalms/domain/content";

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
import { documentOf, saveDocument } from "@faridalms/database/stores/documents";
import {
  markActed,
  readSubject,
} from "@faridalms/database/stores/notifications";
import {
  archiveAnnouncementSchema,
  feedQuerySchema,
  manageQuerySchema,
  publishAnnouncementSchema,
  saveAnnouncementSchema,
  seenSchema,
} from "@faridalms/domain/announcements";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
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
import { registerHostReader } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

const TAB_STATES: Record<string, AnnouncementState[]> = {
  drafts: ["draft"],
  scheduled: ["scheduled"],
  published: ["published"],
  archived: ["archived"],
};

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
    rows: await feedOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      today: context.today,
      tab: input.tab,
      q: input.q,
    }),
    canManage: can(context, "announcements:manage"),
  }));

export const manage = readProcedure
  .input(manageQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "announcements:manage");
    return {
      rows: await managedAnnouncements(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        states: TAB_STATES[input.tab] ?? ["published"],
        q: input.q,
      }),
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
    const [audiences, body] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "announcement",
        id: row.id,
      }),
      documentOf(context.tx, context.tenantId, {
        type: "announcement",
        id: row.id,
      }),
    ]);
    return {
      ...row,
      audiences,
      body: (body?.content ?? null) as ContentDocument | null,
    };
  });

/** One announcement as its reader sees it; those who manage it see who it reached. */
export const record = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const { row, recipient } = await readable(context, input.id);
    const manages = can(context, "announcements:manage");
    const [audiences, body, report] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "announcement",
        id: row.id,
      }),
      documentOf(context.tx, context.tenantId, {
        type: "announcement",
        id: row.id,
      }),
      manages
        ? deliveryReport(context.tx, {
            tenantId: context.tenantId,
            announcementId: row.id,
          })
        : Promise.resolve(null),
    ]);
    return {
      ...row,
      audiences,
      body: (body?.content ?? null) as ContentDocument | null,
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
      title: input.title,
      urgency: input.urgency,
      pinnedUntil: input.pinnedUntil || null,
      expiresOn: input.expiresOn || null,
      requiresAck: input.requiresAck,
      ackDueOn: input.requiresAck ? input.ackDueOn || null : null,
    };
    let announcementId = input.id;
    let version: number;
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
    await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host: { type: "announcement", id: announcementId },
      content: input.body,
      plainText: contentPlainText(input.body),
      mediaIds: contentFileIds(input.body),
      userId: context.actor.userId,
    });
    await audit(context, {
      action: input.id ? "announcement.update" : "announcement.create",
      objectType: "announcement",
      objectId: announcementId,
      details: { title: input.title },
    });
    return { id: announcementId, version };
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
    if (!later)
      await notify(context, users, {
        kind: row.urgency === "urgent" ? "urgent" : "announcement",
        subject: { type: "announcement", id: row.id },
        params: { title: row.title, updated: updating },
        needsAction: row.requiresAck,
      });
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
