import type { DayKind, RequestTopic } from "@faridalms/domain/privacy";

import { schoolProfile, viewer } from "@faridalms/database/stores/identity";
import {
  dayMeanings,
  insertRequest,
  openRequestsBy,
} from "@faridalms/database/stores/privacy";
import {
  learnerRequestLaw,
  MAX_OPEN_CORRECTIONS,
  MAX_OPEN_HEALTH_CHANGES,
  requestDueOn,
} from "@faridalms/domain/privacy";
import { addDays } from "@faridalms/domain/school";
import { isoWeekday, SCHOOL_DAY_MEANINGS } from "@faridalms/domain/school-days";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

import { audit } from "./procedure";

/** The longest a request's clock runs: a month, then two more, then a weekend. */
const CLOCK_SPAN_DAYS = 200;

/**
 * Each day from `from` as the school's calendar has it, and by its week where
 * the calendar says nothing: lessons on school days, offices open on any day
 * that is neither a weekend nor a public holiday.
 */
export async function dayKinds(
  context: UnitContext,
  from: string,
): Promise<(day: string) => DayKind> {
  const scope = { tenantId: context.tenantId, orgId: context.schoolId };
  const [meanings, profile] = await Promise.all([
    dayMeanings(context.tx, {
      ...scope,
      from,
      to: addDays(from, CLOCK_SPAN_DAYS),
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

const MAX_OPEN: Record<RequestTopic | "office", number> = {
  office: MAX_OPEN_CORRECTIONS,
  health: MAX_OPEN_HEALTH_CHANGES,
};

/**
 * Logs a correction request about a learner, by the learner or someone who
 * acts for them, in the register the office keeps, with the deadline the
 * school's law sets, so it is answered on that clock and not lost in a
 * message. A topic names the system that answers it with the change it
 * carries. The caller has checked that the asker may ask.
 */
export async function logLearnerRequest(
  context: UnitContext,
  input: {
    studentId: string;
    details: string | null;
    topic: RequestTopic | null;
  },
): Promise<{ id: string; dueOn: string }> {
  const scope = { tenantId: context.tenantId, orgId: context.schoolId };
  const open = await openRequestsBy(context.tx, {
    ...scope,
    subjectUserId: input.studentId,
    loggedByUserId: context.actor.userId,
    topic: input.topic,
  });
  if (open >= MAX_OPEN[input.topic ?? "office"])
    throw new ORPCError("CONFLICT", { message: "privacy.requests_open" });
  const [me, school] = await Promise.all([
    viewer(context.tx, context.actor.userId),
    schoolProfile(context.tx, context.schoolId),
  ]);
  const law = learnerRequestLaw(school?.countryCode ?? null);
  const self = input.studentId === context.actor.userId;
  const dueOn =
    requestDueOn(
      law,
      "correction",
      context.today,
      await dayKinds(context, context.today),
    ) ?? addDays(context.today, 30);
  const id = await insertRequest(context.tx, {
    ...scope,
    subjectUserId: input.studentId,
    requestedBy: (me?.fullNameEn ?? me?.fullNameAr ?? "").slice(0, 120),
    relation: self ? "self" : "parent",
    kind: "correction",
    law,
    receivedOn: context.today,
    clockFrom: context.today,
    dueOn,
    details: input.details,
    loggedByUserId: context.actor.userId,
    ...(input.topic ? { topic: input.topic } : {}),
  });
  await audit(context, {
    action: "privacy_request.log",
    objectType: "records_request",
    objectId: id,
    subjectUserId: input.studentId,
    details: {
      kind: "correction",
      law,
      dueOn,
      by: self ? "self" : "guardian",
      ...(input.topic ? { topic: input.topic } : {}),
    },
  });
  return { id, dueOn };
}
