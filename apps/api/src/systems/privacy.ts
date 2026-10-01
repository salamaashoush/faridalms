import {
  examWorkOf,
  hadAtSchool,
  holdsOf,
  leaversOf,
  placeHold as placeHoldOf,
  releaseHold as releaseHoldOf,
  retentionOf,
  saveRetention as saveRetentionOf,
  sessionWorkOf,
} from "@faridalms/database/stores/privacy";
import {
  placeHoldSchema,
  releaseHoldSchema,
  reviewDueOn,
  saveRetentionSchema,
} from "@faridalms/domain/privacy";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { sessionViews } from "../core/sessions";

function scopeOf(context: UnitContext) {
  return { tenantId: context.tenantId, orgId: context.schoolId };
}

/** What keeps a leaver's records from being destroyed today, if anything. */
export type Block =
  | { kind: "hold"; reason: string }
  | { kind: "exam"; until: string };

/**
 * The school's retention rules, the leavers they bring up for review with
 * whatever blocks each, the legal holds, and the exam sessions whose
 * coursework has passed its keep-until date.
 */
export const overview = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "privacy:manage");
  const scope = scopeOf(context);
  const [rules, leavers, holds, sessions, sessionWork] = await Promise.all([
    retentionOf(context.tx, scope),
    leaversOf(context.tx, { ...scope, today: context.today }),
    holdsOf(context.tx, scope),
    sessionViews(context),
    sessionWorkOf(context.tx, scope),
  ]);
  const examWork = await examWorkOf(context.tx, {
    tenantId: context.tenantId,
    studentIds: leavers
      .filter((row) => row.kind === "student")
      .map((row) => row.userId),
  });
  const keepUntil = new Map(sessions.map((row) => [row.id, row.keepUntil]));
  const examUntil = new Map<string, string>();
  for (const row of examWork) {
    const until = keepUntil.get(row.sessionId);
    if (!until || until < context.today) continue;
    const known = examUntil.get(row.studentId);
    if (!known || until > known) examUntil.set(row.studentId, until);
  }
  const holdOf = new Map(holds.map((row) => [row.subjectUserId, row]));
  const review = leavers.map((row) => {
    const hold = holdOf.get(row.userId);
    const until = examUntil.get(row.userId);
    const block: Block | null = hold
      ? { kind: "hold", reason: hold.reason }
      : until
        ? { kind: "exam", until }
        : null;
    return {
      ...row,
      id: `${row.kind}:${row.userId}`,
      dueOn: reviewDueOn(rules, row),
      noBirthDate:
        row.kind === "student" &&
        rules.studentRule === "until_age" &&
        row.birthDate === null,
      block,
    };
  });
  const work = new Map(sessionWork.map((row) => [row.sessionId, row]));
  return {
    today: context.today,
    rules,
    review,
    holds,
    sessions: sessions
      .filter((row) => row.keepUntil < context.today)
      .map((row) => ({
        ...row,
        assignments: work.get(row.id)?.assignments ?? 0,
        handedIn: work.get(row.id)?.handedIn ?? 0,
      }))
      .filter((row) => row.assignments > 0),
  };
});

export const saveRetention = writeProcedure
  .input(saveRetentionSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const { before, after } = await saveRetentionOf(context.tx, {
      ...scopeOf(context),
      ...input,
    });
    await audit(context, {
      action: "privacy_retention.update",
      objectType: "retention_settings",
      objectId: context.schoolId,
      details: { before, after },
    });
  });

export const placeHold = writeProcedure
  .input(placeHoldSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const known = await hadAtSchool(context.tx, {
      ...scopeOf(context),
      userId: input.subjectUserId,
    });
    if (!known)
      throw new ORPCError("NOT_FOUND", { message: "privacy.person_unknown" });
    const id = await placeHoldOf(context.tx, {
      tenantId: context.tenantId,
      subjectUserId: input.subjectUserId,
      reason: input.reason,
      placedByUserId: context.actor.userId,
    });
    await audit(context, {
      action: "privacy_hold.place",
      objectType: "legal_hold",
      objectId: id,
      subjectUserId: input.subjectUserId,
      details: { reason: input.reason },
    });
    return { id };
  });

export const releaseHold = writeProcedure
  .input(releaseHoldSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const released = await releaseHoldOf(context.tx, {
      tenantId: context.tenantId,
      id: input.id,
      releasedByUserId: context.actor.userId,
    });
    const ours =
      released !== null &&
      (await hadAtSchool(context.tx, {
        ...scopeOf(context),
        userId: released.subjectUserId,
      }));
    if (!released || !ours)
      throw new ORPCError("NOT_FOUND", { message: "privacy.hold_unknown" });
    await audit(context, {
      action: "privacy_hold.release",
      objectType: "legal_hold",
      objectId: input.id,
      subjectUserId: released.subjectUserId,
      details: { reason: released.reason },
    });
  });
