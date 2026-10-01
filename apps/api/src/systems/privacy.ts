import type { BreachRow } from "@faridalms/database/stores/privacy";
import type { DayKind } from "@faridalms/domain/privacy";

import { schoolProfile } from "@faridalms/database/stores/identity";
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
import {
  breachNoticesSchema,
  closeBreachSchema,
  closeRequestSchema,
  extendedDueOn,
  extendRequestSchema,
  hasClock,
  peopleDueOn,
  peopleMustBeTold,
  placeHoldSchema,
  regulatorDueAt,
  regulatorMustBeTold,
  releaseHoldSchema,
  requestDueOn,
  reviewDueOn,
  saveBreachSchema,
  saveRequestSchema,
  saveRetentionSchema,
} from "@faridalms/domain/privacy";
import { isoWeekday } from "@faridalms/domain/timetable";
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
 * The school's retention rules, the leavers they bring up for review with
 * whatever blocks each, the legal holds, and the exam sessions whose
 * coursework has passed its keep-until date.
 */
export const overview = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "privacy:manage");
  const scope = scopeOf(context);
  const [rules, leavers, holds, requests, sessions, sessionWork, breaches] =
    await Promise.all([
      retentionOf(context.tx, scope),
      leaversOf(context.tx, { ...scope, today: context.today }),
      holdsOf(context.tx, scope),
      requestsOf(context.tx, scope),
      sessionViews(context),
      sessionWorkOf(context.tx, scope),
      breachesOf(context.tx, scope),
    ]);
  const openRequest = new Map<string, string>();
  for (const row of requests) {
    if (row.outcome) continue;
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
  const work = new Map(sessionWork.map((row) => [row.sessionId, row]));
  return {
    today: context.today,
    rules,
    review,
    holds,
    requests,
    breaches: await breachClocks(context, breaches),
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
