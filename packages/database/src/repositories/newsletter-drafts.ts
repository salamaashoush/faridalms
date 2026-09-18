import type { SaveNewsletterDraftInput } from "@faridalms/domain/newsletter";

import { and, count, desc, eq } from "drizzle-orm";

import type { Database } from "../index";

import { newsletterDrafts } from "../schema";
import { ManagementError } from "./management";

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
