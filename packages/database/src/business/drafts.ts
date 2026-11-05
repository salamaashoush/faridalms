import type {
  DraftProgress,
  DraftSpec,
  DraftStep,
} from "@faridalms/domain/provisioning-draft";

import { and, desc, eq, sql } from "drizzle-orm";

import type { BusinessDb } from "./client";

import { recordEvent } from "./events";
import { customers, provisioningDrafts } from "./schema";

export type DraftRow = typeof provisioningDrafts.$inferSelect;

/** Drafts still being filled in, most recently touched first, with their customer. */
export function openDrafts(db: BusinessDb) {
  return db
    .select({ draft: provisioningDrafts, customerName: customers.legalNameEn })
    .from(provisioningDrafts)
    .leftJoin(customers, eq(customers.id, provisioningDrafts.customerId))
    .where(eq(provisioningDrafts.state, "draft"))
    .orderBy(desc(provisioningDrafts.updatedAt));
}

export async function draftById(
  db: BusinessDb,
  id: string,
): Promise<DraftRow | null> {
  const [row] = await db
    .select()
    .from(provisioningDrafts)
    .where(eq(provisioningDrafts.id, id));
  return row ?? null;
}

export async function startDraft(
  db: BusinessDb,
  input: { spec: DraftSpec; by: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(provisioningDrafts)
      .values({ spec: input.spec, createdBy: input.by })
      .returning({ id: provisioningDrafts.id });
    if (!created) throw new Error("draft was not created");
    await recordEvent(tx, {
      operatorId: input.by,
      action: "draft.start",
      subjectType: "draft",
      subjectId: created.id,
    });
    return created.id;
  });
}

/**
 * Saves a step of a draft still being filled in, unless someone saved it
 * since it was read. Answers the new version, or null on a stale save.
 */
export async function saveDraft(
  db: BusinessDb,
  input: {
    id: string;
    expectedVersion: number;
    step: DraftStep;
    customerId: string | null;
    spec: DraftSpec;
    by: string;
  },
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [saved] = await tx
      .update(provisioningDrafts)
      .set({
        step: input.step,
        customerId: input.customerId,
        spec: input.spec,
        version: sql`${provisioningDrafts.version} + 1`,
        updatedAt: sql`statement_timestamp()`,
      })
      .where(
        and(
          eq(provisioningDrafts.id, input.id),
          eq(provisioningDrafts.state, "draft"),
          eq(provisioningDrafts.version, input.expectedVersion),
        ),
      )
      .returning({ version: provisioningDrafts.version });
    if (!saved) return null;
    await recordEvent(tx, {
      operatorId: input.by,
      action: "draft.save",
      subjectType: "draft",
      subjectId: input.id,
      after: { step: input.step, customerId: input.customerId },
    });
    return saved.version;
  });
}

/** Notes how far creating the draft has gone, beside what it had. */
export async function recordProgress(
  db: BusinessDb,
  id: string,
  progress: DraftProgress,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [held] = await tx
      .select({ progress: provisioningDrafts.progress })
      .from(provisioningDrafts)
      .where(eq(provisioningDrafts.id, id))
      .for("update");
    if (!held) throw new Error("draft not found");
    await tx
      .update(provisioningDrafts)
      .set({
        progress: { ...held.progress, ...progress },
        ...(progress.tenantId ? { tenantId: progress.tenantId } : {}),
        updatedAt: sql`statement_timestamp()`,
      })
      .where(eq(provisioningDrafts.id, id));
  });
}

export async function finishDraft(
  db: BusinessDb,
  input: { id: string; tenantId: string; by: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(provisioningDrafts)
      .set({
        state: "created",
        tenantId: input.tenantId,
        updatedAt: sql`statement_timestamp()`,
      })
      .where(eq(provisioningDrafts.id, input.id));
    await recordEvent(tx, {
      operatorId: input.by,
      action: "draft.create",
      subjectType: "draft",
      subjectId: input.id,
      after: { tenantId: input.tenantId },
    });
  });
}

/** Sets a draft aside for good; one creating has begun is finished instead. */
export async function abandonDraft(
  db: BusinessDb,
  input: { id: string; by: string; reason: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [abandoned] = await tx
      .update(provisioningDrafts)
      .set({ state: "abandoned", updatedAt: sql`statement_timestamp()` })
      .where(
        and(
          eq(provisioningDrafts.id, input.id),
          eq(provisioningDrafts.state, "draft"),
          sql`${provisioningDrafts.tenantId} is null`,
        ),
      )
      .returning({ id: provisioningDrafts.id });
    if (!abandoned) return false;
    await recordEvent(tx, {
      operatorId: input.by,
      action: "draft.abandon",
      subjectType: "draft",
      subjectId: input.id,
      reason: input.reason,
    });
    return true;
  });
}
