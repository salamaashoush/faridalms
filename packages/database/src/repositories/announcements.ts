import type { SaveAnnouncementInput } from "@faridalms/domain/notification";

import { contentPlainText } from "@faridalms/domain/content";
import { audienceRoles } from "@faridalms/domain/notification";
import { and, count, eq } from "drizzle-orm";

import type { Database } from "../index";

import { schema } from "../index";
import { ManagementError } from "./management";
import { recordEvent, roleAudience } from "./notifications";

export async function listAnnouncements(
  db: Database,
  viewer: { role: "admin" | "teacher" | "parent" | "student"; manage: boolean },
  requestedPage: number,
) {
  const audiences = (
    ["everyone", "parents", "students", "teachers"] as const
  ).filter((audience) => audienceRoles(audience).includes(viewer.role));
  const filter = viewer.manage
    ? undefined
    : and(
        eq(schema.announcements.status, "published"),
        audiences.length
          ? undefined
          : eq(schema.announcements.audience, "everyone"),
      );
  const [counts] = await db
    .select({ total: count() })
    .from(schema.announcements)
    .where(filter);
  const total = counts?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(requestedPage, pages);
  const rows = await db.query.announcements.findMany({
    where: viewer.manage
      ? {}
      : { status: "published", audience: { in: audiences } },
    columns: {
      id: true,
      title: true,
      summary: true,
      audience: true,
      status: true,
      revision: true,
      publishedAt: true,
      updatedAt: true,
    },
    with: { author: { columns: { name: true } } },
    orderBy: viewer.manage
      ? { updatedAt: "desc", id: "desc" }
      : { publishedAt: "desc", id: "desc" },
    limit: 25,
    offset: (page - 1) * 25,
  });
  return { rows, total, page, pages };
}

export async function getAnnouncement(
  db: Database,
  id: string,
  viewer: { role: "admin" | "teacher" | "parent" | "student"; manage: boolean },
) {
  const row = await db.query.announcements.findFirst({
    where: { id },
    with: { author: { columns: { id: true, name: true } } },
  });
  if (!row) return undefined;
  if (!viewer.manage) {
    if (row.status !== "published") return undefined;
    if (!audienceRoles(row.audience).includes(viewer.role)) return undefined;
  }
  return row;
}

export async function saveAnnouncement(
  db: Database,
  input: SaveAnnouncementInput,
  actorId: string,
  schoolYearId: string,
) {
  const values = {
    title: input.title,
    document: input.document,
    summary: contentPlainText(input.document).trim().slice(0, 500),
    audience: input.audience,
  };
  if (input.expectedRevision === 0) {
    const [created] = await db
      .insert(schema.announcements)
      .values({ ...values, id: input.id, schoolYearId, authorId: actorId })
      .onConflictDoNothing()
      .returning();
    if (!created)
      throw new ManagementError("CONFLICT", "announcement.revision_conflict");
    return created;
  }
  const [updated] = await db
    .update(schema.announcements)
    .set({
      ...values,
      revision: input.expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.announcements.id, input.id),
        eq(schema.announcements.revision, input.expectedRevision),
      ),
    )
    .returning();
  if (!updated) {
    const exists = await db.query.announcements.findFirst({
      where: { id: input.id },
      columns: { id: true },
    });
    if (!exists)
      throw new ManagementError("NOT_FOUND", "announcement.not_found");
    throw new ManagementError("CONFLICT", "announcement.revision_conflict");
  }
  return updated;
}

/** Publication and the notification of its audience commit together. */
export async function publishAnnouncement(
  db: Database,
  id: string,
  expectedRevision: number,
  actor: { id: string; name: string },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(schema.announcements)
      .where(eq(schema.announcements.id, id))
      .for("update");
    if (!current)
      throw new ManagementError("NOT_FOUND", "announcement.not_found");
    if (current.revision !== expectedRevision)
      throw new ManagementError("CONFLICT", "announcement.revision_conflict");
    if (current.title.trim().length < 3 || !current.summary)
      throw new ManagementError("BAD_REQUEST", "announcement.incomplete");
    const [updated] = await tx
      .update(schema.announcements)
      .set({
        status: "published",
        publishedAt: current.publishedAt ?? new Date(),
        revision: current.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.announcements.id, id))
      .returning({
        id: schema.announcements.id,
        revision: schema.announcements.revision,
        status: schema.announcements.status,
      });
    if (!updated) throw new Error("announcement.publish_failed");
    if (current.status !== "published")
      await recordEvent(tx, {
        type: "announcement_published",
        subjectId: id,
        actorId: actor.id,
        payload: {
          title: current.title,
          preview: current.summary.slice(0, 160),
          actorName: actor.name,
          studentName: null,
          link: { kind: "announcement", id },
        },
        recipientIds: await roleAudience(tx, audienceRoles(current.audience)),
      });
    return updated;
  });
}

export async function deleteAnnouncement(
  db: Database,
  id: string,
  expectedRevision: number,
) {
  const rows = await db
    .delete(schema.announcements)
    .where(
      and(
        eq(schema.announcements.id, id),
        eq(schema.announcements.revision, expectedRevision),
        eq(schema.announcements.status, "draft"),
      ),
    )
    .returning({ id: schema.announcements.id });
  if (rows.length === 0)
    throw new ManagementError("CONFLICT", "announcement.revision_conflict");
}
