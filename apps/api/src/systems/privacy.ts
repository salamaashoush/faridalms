import type { BreachRow } from "@faridalms/database/stores/privacy";
import type { DayKind } from "@faridalms/domain/privacy";

import {
  approveErasure as approveErasureOf,
  erasurePlan,
  eraseSubject,
  erasuresOf,
} from "@faridalms/database/stores/erasure";
import { schoolProfile, viewer } from "@faridalms/database/stores/identity";
import { childrenOf } from "@faridalms/database/stores/persons";
import {
  breachById,
  breachesOf,
  closeBreach as closeBreachOf,
  closeRequest as closeRequestOf,
  dayMeanings,
  examWorkOf,
  extendRequest as extendRequestOf,
  hadAtSchool,
  holdsOf,
  insertBreach,
  leaversOf,
  placeHold as placeHoldOf,
  insertRequest,
  openRequestsBy,
  releaseHold as releaseHoldOf,
  requestById,
  requestsOf,
  retentionOf,
  saveRetention as saveRetentionOf,
  sessionWorkOf,
  setBreachNotices,
  updateBreach,
  updateRequest,
} from "@faridalms/database/stores/privacy";
import { SCHOOL_DAY_MEANINGS } from "@faridalms/domain/calendar";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  approveErasureSchema,
  askCorrectionSchema,
  breachNoticesSchema,
  closeBreachSchema,
  closeRequestSchema,
  extendedDueOn,
  extendRequestSchema,
  familyRequestLaw,
  hasClock,
  MAX_OPEN_CORRECTIONS,
  peopleDueOn,
  peopleMustBeTold,
  placeHoldSchema,
  regulatorDueAt,
  regulatorMustBeTold,
  releaseHoldSchema,
  requestDueOn,
  reviewDueOn,
  runErasureSchema,
  saveBreachSchema,
  saveRequestSchema,
  saveRetentionSchema,
} from "@faridalms/domain/privacy";
import { isoWeekday } from "@faridalms/domain/timetable";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  openUnit,
  readProcedure,
  requireCapability,
  schoolProcedure,
  writeProcedure,
} from "../core/procedure";
import { sessionViews } from "../core/sessions";

function scopeOf(context: UnitContext) {
  return { tenantId: context.tenantId, orgId: context.schoolId };
}

/** What keeps a leaver's records from being destroyed today, if anything. */
export type Block =
  | { kind: "hold"; reason: string }
  | { kind: "request"; dueOn: string }
  | { kind: "exam"; until: string };

/** Each breach with who must be told and by when. */
async function breachClocks(context: UnitContext, rows: BreachRow[]) {
  const profile = await schoolProfile(context.tx, context.schoolId);
  const dayIn = new Intl.DateTimeFormat("en-CA", {
    timeZone: profile?.timeZone ?? "UTC",
  });
  const discoveredOn = (row: BreachRow) =>
    dayIn.format(new Date(row.discoveredAt));
  const first = rows
    .filter((row) => !row.closedAt)
    .map(discoveredOn)
    .toSorted()[0];
  const dayOf = first ? await dayKinds(context, first) : null;
  return rows.map((row) => ({
    ...row,
    regulatorRequired: regulatorMustBeTold(row.law, row.risk),
    regulatorDueAt: regulatorDueAt(row.discoveredAt),
    peopleRequired: peopleMustBeTold(row.law, row.risk),
    peopleDueOn:
      dayOf && !row.closedAt
        ? peopleDueOn(row.law, discoveredOn(row), dayOf)
        : null,
  }));
}

/** The longest a request's clock runs: a month, then two more, then a weekend. */
const CLOCK_SPAN_DAYS = 200;

function plusDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Each day from `from` as the school's calendar has it, and by its week where
 * the calendar says nothing: lessons on school days, offices open on any day
 * that is neither a weekend nor a public holiday.
 */
async function dayKinds(
  context: UnitContext,
  from: string,
): Promise<(day: string) => DayKind> {
  const [meanings, profile] = await Promise.all([
    dayMeanings(context.tx, {
      ...scopeOf(context),
      from,
      to: plusDays(from, CLOCK_SPAN_DAYS),
    }),
    schoolProfile(context.tx, context.schoolId),
  ]);
  const weekend = new Set(profile?.weekendDays ?? []);
  return (day) => {
    const known = meanings.get(day);
    const restDay = weekend.has(isoWeekday(day));
    if (!known) return { school: !restDay, working: !restDay };
    const school = known.some((meaning) =>
      SCHOOL_DAY_MEANINGS.includes(meaning),
    );
    const closed =
      known.includes("public_holiday") ||
      known.includes("weekend") ||
      (restDay && !school);
    return { school, working: !closed };
  };
}

/**
 * The leavers the school's rules bring up for review, each with whatever
 * blocks their erasure. An erasure request being fulfilled does not block
 * the erasure it asks for.
 */
async function reviewOf(context: UnitContext, fulfilling: string | null) {
  const scope = scopeOf(context);
  const [rules, leavers, holds, requests, sessions] = await Promise.all([
    retentionOf(context.tx, scope),
    leaversOf(context.tx, { ...scope, today: context.today }),
    holdsOf(context.tx, scope),
    requestsOf(context.tx, scope),
    sessionViews(context),
  ]);
  const openRequest = new Map<string, string>();
  for (const row of requests) {
    if (row.outcome || row.id === fulfilling) continue;
    const due = row.extendedTo ?? row.dueOn;
    const known = openRequest.get(row.subjectUserId);
    if (!known || due < known) openRequest.set(row.subjectUserId, due);
  }
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
    const asked = openRequest.get(row.userId);
    const until = examUntil.get(row.userId);
    const block: Block | null = hold
      ? { kind: "hold", reason: hold.reason }
      : asked
        ? { kind: "request", dueOn: asked }
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
  return { rules, review, holds, requests, sessions };
}

/**
 * The school's retention rules, the leavers they bring up for review with
 * whatever blocks each, the registers of holds, requests, breaches and
 * erasures, and the exam sessions whose coursework has passed its keep-until
 * date.
 */
export const overview = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "privacy:manage");
  const scope = scopeOf(context);
  const [
    { rules, review, holds, requests, sessions },
    sessionWork,
    breaches,
    erasures,
  ] = await Promise.all([
    reviewOf(context, null),
    sessionWorkOf(context.tx, scope),
    breachesOf(context.tx, scope),
    erasuresOf(context.tx, scope),
  ]);
  const work = new Map(sessionWork.map((row) => [row.sessionId, row]));
  return {
    today: context.today,
    rules,
    review,
    holds,
    requests,
    breaches: await breachClocks(context, breaches),
    erasures,
    erasure: {
      approve: can(context, "erasure:approve"),
      available: context.cell.canErase(),
    },
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

/** Logs a request, or changes one still open, with the deadline its law sets. */
export const saveRequest = writeProcedure
  .input(saveRequestSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const known = await hadAtSchool(context.tx, {
      ...scopeOf(context),
      userId: input.subjectUserId,
    });
    if (!known)
      throw new ORPCError("NOT_FOUND", { message: "privacy.person_unknown" });
    const statutory = hasClock(input.law, input.kind)
      ? requestDueOn(
          input.law,
          input.kind,
          input.clockFrom,
          await dayKinds(context, input.clockFrom),
        )
      : null;
    const fields = {
      subjectUserId: input.subjectUserId,
      requestedBy: input.requestedBy,
      relation: input.relation,
      kind: input.kind,
      law: input.law,
      receivedOn: input.receivedOn,
      clockFrom: input.clockFrom,
      dueOn: statutory ?? input.dueOn ?? input.clockFrom,
      details: input.details || null,
    };
    if (input.id) {
      const before = await requestById(context.tx, {
        ...scopeOf(context),
        id: input.id,
      });
      const updated = await updateRequest(context.tx, {
        ...scopeOf(context),
        id: input.id,
        ...fields,
        keepExtension: before?.dueOn === fields.dueOn,
      });
      if (!updated)
        throw new ORPCError("NOT_FOUND", {
          message: "privacy.request_closed",
        });
    }
    const id =
      input.id ??
      (await insertRequest(context.tx, {
        ...scopeOf(context),
        ...fields,
        loggedByUserId: context.actor.userId,
      }));
    await audit(context, {
      action: input.id ? "privacy_request.update" : "privacy_request.log",
      objectType: "records_request",
      objectId: id,
      subjectUserId: input.subjectUserId,
      details: {
        kind: input.kind,
        law: input.law,
        receivedOn: input.receivedOn,
        clockFrom: input.clockFrom,
        dueOn: fields.dueOn,
      },
    });
    return { id, dueOn: fields.dueOn };
  });

/**
 * A guardian asks the school to correct what it holds about their child.
 * The request goes into the same register the office logs requests in, with
 * the deadline the school's law sets, so it is answered on that clock and
 * not lost in a message. Only a guardian who decides for the child may ask;
 * one who only follows them sees the record and leaves changes to the other.
 */
export const askCorrection = writeProcedure
  .input(askCorrectionSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "children:read");
    const link = (
      await childrenOf(
        context.tx,
        {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          today: context.today,
          viewerId: context.actor.userId,
          schoolWide: false,
        },
        context.actor.userId,
      )
    ).find((row) => row.studentId === input.studentId);
    if (!link) throw new ORPCError("NOT_FOUND");
    if (link.educationalRights !== "full")
      throw new ORPCError("FORBIDDEN", { message: "privacy.follows_only" });
    const scope = scopeOf(context);
    const open = await openRequestsBy(context.tx, {
      ...scope,
      subjectUserId: input.studentId,
      loggedByUserId: context.actor.userId,
    });
    if (open >= MAX_OPEN_CORRECTIONS)
      throw new ORPCError("CONFLICT", { message: "privacy.requests_open" });
    const [me, school] = await Promise.all([
      viewer(context.tx, context.actor.userId),
      schoolProfile(context.tx, context.schoolId),
    ]);
    const law = familyRequestLaw(school?.countryCode ?? null);
    const dueOn =
      requestDueOn(
        law,
        "correction",
        context.today,
        await dayKinds(context, context.today),
      ) ?? plusDays(context.today, 30);
    const id = await insertRequest(context.tx, {
      ...scope,
      subjectUserId: input.studentId,
      requestedBy: (me?.fullNameEn ?? me?.fullNameAr ?? "").slice(0, 120),
      relation: "parent",
      kind: "correction",
      law,
      receivedOn: context.today,
      clockFrom: context.today,
      dueOn,
      details: input.details,
      loggedByUserId: context.actor.userId,
    });
    await audit(context, {
      action: "privacy_request.log",
      objectType: "records_request",
      objectId: id,
      subjectUserId: input.studentId,
      details: { kind: "correction", law, dueOn, by: "guardian" },
    });
    return { id, dueOn };
  });

/** Gives a complex UK request the two further months the law allows. */
export const extendRequest = writeProcedure
  .input(extendRequestSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const request = await requestById(context.tx, {
      ...scopeOf(context),
      id: input.id,
    });
    if (!request || request.outcome)
      throw new ORPCError("NOT_FOUND", { message: "privacy.request_closed" });
    if (request.law !== "uk_gdpr" || request.extendedTo)
      throw new ORPCError("BAD_REQUEST", {
        message: "privacy.no_extension",
      });
    const extendedTo = extendedDueOn(
      request.dueOn,
      await dayKinds(context, request.dueOn),
    );
    await extendRequestOf(context.tx, {
      ...scopeOf(context),
      id: input.id,
      extendedTo,
      reason: input.reason,
    });
    await audit(context, {
      action: "privacy_request.extend",
      objectType: "records_request",
      objectId: input.id,
      subjectUserId: request.subjectUserId,
      details: { from: request.dueOn, to: extendedTo, reason: input.reason },
    });
    return { extendedTo };
  });

export const closeRequest = writeProcedure
  .input(closeRequestSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const request = await requestById(context.tx, {
      ...scopeOf(context),
      id: input.id,
    });
    const closed =
      request !== null &&
      (await closeRequestOf(context.tx, {
        ...scopeOf(context),
        id: input.id,
        outcome: input.outcome,
        note: input.note,
        closedByUserId: context.actor.userId,
      }));
    if (!request || !closed)
      throw new ORPCError("NOT_FOUND", { message: "privacy.request_closed" });
    await audit(context, {
      action: "privacy_request.close",
      objectType: "records_request",
      objectId: input.id,
      subjectUserId: request.subjectUserId,
      details: {
        outcome: input.outcome,
        note: input.note,
        dueOn: request.extendedTo ?? request.dueOn,
        late: context.today > (request.extendedTo ?? request.dueOn),
      },
    });
  });

/** Logs a breach the school has become aware of, or corrects one still open. */
export const saveBreach = writeProcedure
  .input(saveBreachSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const { id: given, ...fields } = input;
    if (given) {
      const updated = await updateBreach(context.tx, {
        ...scopeOf(context),
        id: given,
        ...fields,
      });
      if (!updated)
        throw new ORPCError("NOT_FOUND", { message: "privacy.breach_closed" });
    }
    const id =
      given ??
      (await insertBreach(context.tx, {
        ...scopeOf(context),
        ...fields,
        loggedByUserId: context.actor.userId,
      }));
    await audit(context, {
      action: given ? "privacy_breach.update" : "privacy_breach.log",
      objectType: "breach",
      objectId: id,
      details: {
        title: fields.title,
        discoveredAt: fields.discoveredAt,
        law: fields.law,
        risk: fields.risk,
        peopleAffected: fields.peopleAffected,
      },
    });
    return { id };
  });

/** Records who was told of a breach and when, or why they were not. */
export const breachNotices = writeProcedure
  .input(breachNoticesSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const { id, ...notices } = input;
    const saved = await setBreachNotices(context.tx, {
      ...scopeOf(context),
      id,
      ...notices,
      regulatorReference: notices.regulatorNotifiedAt
        ? notices.regulatorReference
        : null,
    });
    if (!saved)
      throw new ORPCError("NOT_FOUND", { message: "privacy.breach_closed" });
    await audit(context, {
      action: "privacy_breach.notices",
      objectType: "breach",
      objectId: id,
      details: notices,
    });
  });

/** Closes a breach once both notices are settled and its remedy is written. */
export const closeBreach = writeProcedure
  .input(closeBreachSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "privacy:manage");
    const breach = await breachById(context.tx, {
      ...scopeOf(context),
      id: input.id,
    });
    if (!breach || breach.closedAt)
      throw new ORPCError("NOT_FOUND", { message: "privacy.breach_closed" });
    const settled =
      (breach.regulatorNotifiedAt ?? breach.regulatorReason) !== null &&
      (breach.peopleNotifiedAt ?? breach.peopleReason) !== null;
    if (!settled)
      throw new ORPCError("BAD_REQUEST", {
        message: "privacy.breach_notices_open",
      });
    await closeBreachOf(context.tx, {
      ...scopeOf(context),
      id: input.id,
      actions: input.actions,
      closedByUserId: context.actor.userId,
    });
    await audit(context, {
      action: "privacy_breach.close",
      objectType: "breach",
      objectId: input.id,
      details: { actions: input.actions },
    });
  });

const BLOCK_ERROR: Record<Block["kind"], string> = {
  hold: "privacy.erasure_held",
  request: "privacy.erasure_requested",
  exam: "privacy.erasure_exam",
};

/**
 * Approves erasing a person who has left: on the school's retention rules
 * once their review date has passed, to fulfil their open erasure request,
 * or on a regulator's order. Nothing blocking may stand, and the documents
 * and files the erasure will take are listed with the approval.
 */
export const approveErasure = writeProcedure
  .input(approveErasureSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "erasure:approve");
    const request = input.requestId
      ? (await requestsOf(context.tx, scopeOf(context))).find(
          (row) => row.id === input.requestId,
        )
      : null;
    if (
      input.requestId &&
      (!request ||
        request.outcome ||
        request.kind !== "erasure" ||
        request.subjectUserId !== input.subjectUserId)
    )
      throw new ORPCError("BAD_REQUEST", {
        message: "privacy.erasure_request_needed",
      });
    const pending = (await erasuresOf(context.tx, scopeOf(context))).some(
      (row) => row.subjectUserId === input.subjectUserId && !row.erasedAt,
    );
    if (pending)
      throw new ORPCError("CONFLICT", { message: "privacy.erasure_pending" });
    const { review } = await reviewOf(context, input.requestId);
    const person = review.find((row) => row.userId === input.subjectUserId);
    if (!person)
      throw new ORPCError("NOT_FOUND", { message: "privacy.not_a_leaver" });
    if (person.block)
      throw new ORPCError("CONFLICT", {
        message: BLOCK_ERROR[person.block.kind],
      });
    if (
      input.basis === "retention_schedule" &&
      (person.dueOn === null || person.dueOn > context.today)
    )
      throw new ORPCError("BAD_REQUEST", { message: "privacy.not_yet_due" });
    const plan = await erasurePlan(context.tx, {
      tenantId: context.tenantId,
      subjectUserId: input.subjectUserId,
    });
    const id = await approveErasureOf(context.tx, {
      tenantId: context.tenantId,
      subjectUserId: input.subjectUserId,
      basis: input.basis,
      requestReference: input.requestId ?? input.reference,
      approvedByUserId: context.actor.userId,
      plan,
    });
    const listed = {
      documents: plan.documents.length,
      files: plan.files.length,
    };
    await audit(context, {
      action: "privacy_erasure.approve",
      objectType: "erasure_approval",
      objectId: id,
      subjectUserId: input.subjectUserId,
      details: { basis: input.basis, ...listed },
    });
    return { id, ...listed };
  });

/**
 * Runs an approved erasure. The approval must have committed before the
 * `retention` role can see it, so this is its own call, in three units of
 * work: check, erase as `retention`, then record what was done. A failed
 * run leaves the approval standing to be run again.
 */
export const runErasure = schoolProcedure
  .input(runErasureSchema)
  .handler(async ({ input, context }) => {
    const ready = await openUnit(context, "read", async (opened) => {
      const unit = { ...context, ...opened };
      requireCapability(unit, "erasure:approve");
      const erasures = await erasuresOf(unit.tx, scopeOf(unit));
      const approval = erasures.find(
        (row) => row.subjectUserId === input.subjectUserId,
      );
      if (!approval)
        throw new ORPCError("NOT_FOUND", {
          message: "privacy.erasure_not_approved",
        });
      if (approval.erasedAt)
        throw new ORPCError("CONFLICT", { message: "privacy.erased" });
      return { tenantId: unit.tenantId, approvalId: approval.id };
    });
    if (!context.cell.canErase())
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "privacy.erasure_unavailable",
      });
    const result = await context.cell.withRetention(
      {
        tenantId: ready.tenantId,
        requestId: context.requestId,
        actor: { kind: "system" },
      },
      (tx) =>
        eraseSubject(tx, {
          tenantId: ready.tenantId,
          subjectUserId: input.subjectUserId,
          emptyContent: emptyContent(),
        }),
    );
    const erased = (result.counts.users ?? 0) === 1;
    await openUnit(context, "write", async (opened) => {
      const unit = { ...context, ...opened };
      await audit(unit, {
        action: "privacy_erasure.run",
        objectType: "erasure_approval",
        objectId: ready.approvalId,
        subjectUserId: input.subjectUserId,
        outcome: erased ? "success" : "failed",
        details: { counts: result.counts },
      });
      if (erased)
        for (const key of result.storageKeys)
          unit.afterCommit(() => context.files.remove(key));
    });
    if (!erased)
      throw new ORPCError("CONFLICT", { message: "privacy.erasure_blocked" });
    return { counts: result.counts };
  });
