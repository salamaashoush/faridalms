import type { SaveNewsletterDraftInput } from "@faridalms/domain/newsletter";

import { newsletterPlainText } from "@faridalms/domain/newsletter";
import { and, count, desc, eq } from "drizzle-orm";

import type { Database } from "../index";

import { newsletterDrafts, newsletters } from "../schema";
import { ManagementError } from "./management";
import { recordEvent, roleAudience } from "./notifications";

export async function getNewsletterDraft(db: Database, id: string) {
  const [draft] = await db
    .select()
    .from(newsletterDrafts)
    .where(eq(newsletterDrafts.id, id));
  return draft;
}

export async function listNewsletterDrafts(
  db: Database,
  schoolYearId: string,
  requestedPage: number,
) {
  const filter = eq(newsletterDrafts.schoolYearId, schoolYearId);
  const [result] = await db
    .select({ total: count() })
    .from(newsletterDrafts)
    .where(filter);
  const total = result?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(requestedPage, pages);
  const rows = await db
    .select({
      id: newsletterDrafts.id,
      title: newsletterDrafts.title,
      summary: newsletterDrafts.summary,
      revision: newsletterDrafts.revision,
      updatedAt: newsletterDrafts.updatedAt,
    })
    .from(newsletterDrafts)
    .where(filter)
    .orderBy(desc(newsletterDrafts.updatedAt), desc(newsletterDrafts.id))
    .limit(25)
    .offset((page - 1) * 25);
  return { rows, total, pages, page };
}

export async function saveNewsletterDraft(
  db: Database,
  userId: string,
  input: SaveNewsletterDraftInput,
) {
  const year = await db.query.schoolYears.findFirst({
    where: { id: input.schoolYearId },
    columns: { id: true },
  });
  if (!year) throw new ManagementError("NOT_FOUND", "academic_year.not_found");
  const values = {
    schoolYearId: input.schoolYearId,
    title: input.title,
    summary: input.summary,
    document: input.document,
    updatedById: userId,
  };
  if (input.expectedRevision === 0) {
    const [created] = await db
      .insert(newsletterDrafts)
      .values({ ...values, id: input.id, createdById: userId })
      .onConflictDoNothing()
      .returning();
    if (!created)
      throw new ManagementError("CONFLICT", "newsletter.revision_conflict");
    return created;
  }
  const [updated] = await db
    .update(newsletterDrafts)
    .set({
      ...values,
      revision: input.expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(newsletterDrafts.id, input.id),
        eq(newsletterDrafts.revision, input.expectedRevision),
      ),
    )
    .returning();
  if (!updated) {
    if (!(await getNewsletterDraft(db, input.id)))
      throw new ManagementError("NOT_FOUND", "newsletter.not_found");
    throw new ManagementError("CONFLICT", "newsletter.revision_conflict");
  }
  return updated;
}

export async function getNewsletterEditorContext(db: Database) {
  const years = await db.query.schoolYears.findMany({
    columns: { id: true, name: true, isCurrent: true },
    orderBy: { startsOn: "desc", id: "asc" },
  });
  return { years };
}

/**
 * Copies the draft into an immutable edition and tells the school. The draft
 * stays editable for the next edition; the published copy never changes.
 */
export async function publishNewsletterDraft(
  db: Database,
  input: { id: string; expectedRevision: number; publishedOn: string },
  actor: { id: string; name: string },
) {
  return db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(newsletterDrafts)
      .where(eq(newsletterDrafts.id, input.id))
      .for("update");
    if (!draft) throw new ManagementError("NOT_FOUND", "newsletter.not_found");
    if (draft.revision !== input.expectedRevision)
      throw new ManagementError("CONFLICT", "newsletter.revision_conflict");
    if (draft.title.trim().length < 3)
      throw new ManagementError("BAD_REQUEST", "newsletter.incomplete");
    const text = newsletterPlainText(draft.document).trim();
    if (!text)
      throw new ManagementError("BAD_REQUEST", "newsletter.incomplete");
    const [edition] = await tx
      .insert(newsletters)
      .values({
        schoolYearId: draft.schoolYearId,
        title: draft.title,
        summary: draft.summary || text.slice(0, 500),
        document: draft.document,
        draftId: draft.id,
        publishedOn: input.publishedOn,
      })
      .returning({ id: newsletters.id });
    if (!edition) throw new Error("newsletter.publish_failed");
    await tx
      .update(newsletterDrafts)
      .set({
        publishedNewsletterId: edition.id,
        revision: draft.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(newsletterDrafts.id, draft.id));
    await recordEvent(tx, {
      type: "newsletter_published",
      subjectId: edition.id,
      actorId: actor.id,
      payload: {
        title: draft.title,
        preview: (draft.summary || text).slice(0, 160),
        actorName: actor.name,
        studentName: null,
        link: { kind: "newsletter", id: edition.id },
      },
      recipientIds: await roleAudience(tx, ["parent", "teacher", "student"]),
    });
    return { id: edition.id, revision: draft.revision + 1 };
  });
}

export async function getNewsletterEdition(db: Database, id: string) {
  return db.query.newsletters.findFirst({ where: { id } });
}
