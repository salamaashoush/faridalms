import type {
  ActivityKind,
  LeadInput,
  LeadIntake,
  LeadState,
  LostReason,
} from "@faridalms/domain/leads";

import { and, asc, desc, eq, inArray, isNull, lt, lte } from "drizzle-orm";

import type { BusinessDb } from "./client";

import { recordEvent } from "./events";
import { leadActivities, leads, quotes } from "./schema";

export type LeadRow = typeof leads.$inferSelect;
export type LeadActivityRow = typeof leadActivities.$inferSelect;

const OPEN: LeadState[] = [
  "new",
  "contacted",
  "demo_booked",
  "demo_done",
  "proposal",
];

/** Every lead, those still open first by their next step, then the closed. */
export function listLeads(db: BusinessDb): Promise<LeadRow[]> {
  return db
    .select()
    .from(leads)
    .orderBy(asc(leads.nextStepOn), desc(leads.createdAt));
}

/** Open leads whose next step is due by the day, soonest first. */
export function dueNextSteps(db: BusinessDb, day: string): Promise<LeadRow[]> {
  return db
    .select()
    .from(leads)
    .where(and(inArray(leads.state, OPEN), lte(leads.nextStepOn, day)))
    .orderBy(asc(leads.nextStepOn));
}

/** A lead with what was done on it, newest first. */
export async function leadById(db: BusinessDb, id: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) return null;
  const activities = await db
    .select()
    .from(leadActivities)
    .where(eq(leadActivities.leadId, id))
    .orderBy(desc(leadActivities.occurredAt));
  return { lead, activities };
}

/**
 * Writes a lead a cell sent, once: the same intake again answers the lead
 * it made. Its event names its source and organisation, never the person.
 */
export async function intakeLead(
  db: BusinessDb,
  input: LeadIntake,
): Promise<{ id: string; created: boolean }> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(leads)
      .values({
        intakeId: input.intakeId,
        source: input.source,
        name: input.name,
        email: input.email,
        phone: input.phone,
        organisation: input.organisation,
        role: input.role,
        size: input.size,
        country: input.country,
        locale: input.locale,
        message: input.message,
        schoolId: input.schoolId,
        tenantId: input.tenantId,
        module: input.module,
      })
      .onConflictDoNothing({ target: leads.intakeId })
      .returning({ id: leads.id });
    if (!created) {
      const [held] = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.intakeId, input.intakeId));
      if (!held) throw new Error("intake lead missing");
      return { id: held.id, created: false };
    }
    await recordEvent(tx, {
      operatorId: `intake:${input.source}`,
      action: "lead.create",
      subjectType: "lead",
      subjectId: created.id,
      after: {
        source: input.source,
        organisation: input.organisation,
        module: input.module,
      },
    });
    return { id: created.id, created: true };
  });
}

export async function createLead(
  db: BusinessDb,
  input: LeadInput & { by: string },
): Promise<string> {
  const { by, ...fields } = input;
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(leads)
      .values({ ...fields, source: "manual", ownerId: by })
      .returning({ id: leads.id });
    if (!created) throw new Error("lead was not created");
    await recordEvent(tx, {
      operatorId: by,
      action: "lead.create",
      subjectType: "lead",
      subjectId: created.id,
      after: { source: "manual", organisation: fields.organisation },
    });
    return created.id;
  });
}

/** Changes a lead's details unless someone did since they were read. */
export async function saveLead(
  db: BusinessDb,
  input: LeadInput & { id: string; expectedVersion: number; by: string },
): Promise<boolean> {
  const { id, expectedVersion, by, ...fields } = input;
  return db.transaction(async (tx) => {
    const [saved] = await tx
      .update(leads)
      .set({ ...fields, version: expectedVersion + 1 })
      .where(and(eq(leads.id, id), eq(leads.version, expectedVersion)))
      .returning({ id: leads.id });
    if (!saved) return false;
    await recordEvent(tx, {
      operatorId: by,
      action: "lead.update",
      subjectType: "lead",
      subjectId: id,
      after: { organisation: fields.organisation, size: fields.size },
    });
    return true;
  });
}

/** Moves a lead along the pipeline, with why when it was lost. */
export async function setLeadState(
  db: BusinessDb,
  input: {
    id: string;
    state: LeadState;
    lostReason: LostReason | null;
    by: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ state: leads.state })
      .from(leads)
      .where(eq(leads.id, input.id))
      .for("update");
    if (!before) throw new Error("NOT_FOUND");
    await tx
      .update(leads)
      .set({ state: input.state, lostReason: input.lostReason })
      .where(eq(leads.id, input.id));
    await recordEvent(tx, {
      operatorId: input.by,
      action: "lead.state",
      subjectType: "lead",
      subjectId: input.id,
      before: { state: before.state },
      after: { state: input.state, lostReason: input.lostReason },
    });
  });
}

/** Who works a lead and what they do next, by when. */
export async function planLead(
  db: BusinessDb,
  input: {
    id: string;
    ownerId: string | null;
    nextStep: string | null;
    nextStepOn: string | null;
    by: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({
        ownerId: input.ownerId,
        nextStep: input.nextStep,
        nextStepOn: input.nextStepOn,
      })
      .where(eq(leads.id, input.id));
    await recordEvent(tx, {
      operatorId: input.by,
      action: "lead.plan",
      subjectType: "lead",
      subjectId: input.id,
      after: { ownerId: input.ownerId, nextStepOn: input.nextStepOn },
    });
  });
}

/** Logs a call, meeting, email or note, which counts as contact. */
export async function addActivity(
  db: BusinessDb,
  input: { leadId: string; kind: ActivityKind; note: string; by: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(leadActivities).values({
      leadId: input.leadId,
      kind: input.kind,
      note: input.note,
      createdBy: input.by,
    });
    await tx
      .update(leads)
      .set({ lastContactAt: new Date() })
      .where(eq(leads.id, input.leadId));
  });
}

/**
 * Deletes leads lost and last contacted before the cutoff, with their
 * activities and the quotes no customer accepted, as the privacy notice
 * promises. Answers how many went.
 */
export async function purgeLostLeads(
  db: BusinessDb,
  cutoff: Date,
): Promise<number> {
  return db.transaction(async (tx) => {
    const gone = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.state, "lost"), lt(leads.lastContactAt, cutoff)));
    if (gone.length === 0) return 0;
    const ids = gone.map((row) => row.id);
    await tx
      .delete(quotes)
      .where(and(inArray(quotes.leadId, ids), isNull(quotes.customerId)));
    await tx.delete(leads).where(inArray(leads.id, ids));
    return ids.length;
  });
}
