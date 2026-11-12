import type { ActingPurpose } from "@faridalms/domain/acting";

import { decidingFacts } from "@faridalms/database/stores/students";
import { ageReached } from "@faridalms/domain/acting";

import type { UnitContext } from "../core/context";
import type { ModuleScope } from "../core/extension";

import { contributionsTo, point } from "../core/extension";

/**
 * One person acting for one learner: through a module's link, or as the
 * learner themself (`linkId` null).
 */
export interface ActingLink {
  studentId: string;
  userId: string;
  linkId: string | null;
}

/**
 * A module that knows who acts for a learner, for what: its links, each
 * permitting purposes by its own rule, and never by anything a request
 * sends.
 */
export interface ActingFor {
  /** The learners the person acts for on the day for the purpose. */
  learnersOf(
    scope: ModuleScope,
    input: { userId: string; on: string; purpose: ActingPurpose },
  ): Promise<ActingLink[]>;
  /** Those who act for the learners on the day for the purpose. */
  actorsOf(
    scope: ModuleScope,
    input: {
      studentIds: readonly string[];
      on: string;
      purpose: ActingPurpose;
    },
  ): Promise<ActingLink[]>;
}

export const actingFor = point<ActingFor>("acting for");

/** The learners a person acts for through the modules on, for a purpose. */
export async function learnersActedFor(
  scope: ModuleScope,
  input: { userId: string; on: string; purpose: ActingPurpose },
): Promise<ActingLink[]> {
  const found = await Promise.all(
    (await contributionsTo(scope, actingFor)).map((contribution) =>
      contribution.learnersOf(scope, input),
    ),
  );
  return found.flat();
}

/** Those who act for the learners through the modules on, for a purpose. */
export async function actorsFor(
  scope: ModuleScope,
  input: { studentIds: readonly string[]; on: string; purpose: ActingPurpose },
): Promise<ActingLink[]> {
  if (input.studentIds.length === 0) return [];
  const found = await Promise.all(
    (await contributionsTo(scope, actingFor)).map((contribution) =>
      contribution.actorsOf(scope, input),
    ),
  );
  return found.flat();
}

/**
 * Of the learners, those who decide for themselves on the day: of the
 * school's age by their birth date. One with no birth date on file does not.
 */
export async function decidingLearners(
  scope: ModuleScope,
  studentIds: readonly string[],
  on: string,
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const facts = await decidingFacts(scope.tx, {
    tenantId: scope.tenantId,
    schoolId: scope.schoolId,
    studentIds,
  });
  const from = facts.from;
  if (from === null) return new Set();
  return new Set(
    studentIds.filter((id) =>
      ageReached(facts.births.get(id) ?? null, on, from),
    ),
  );
}

/**
 * Who answers for each learner for a purpose that signs, asks or reports:
 * those who act for them, and the learner themself once they decide for
 * themselves.
 */
export async function answerersFor(
  scope: ModuleScope,
  input: { studentIds: readonly string[]; on: string; purpose: ActingPurpose },
): Promise<ActingLink[]> {
  const [others, deciding] = await Promise.all([
    actorsFor(scope, input),
    decidingLearners(scope, input.studentIds, input.on),
  ]);
  return [
    ...[...deciding].map((studentId) => ({
      studentId,
      userId: studentId,
      linkId: null,
    })),
    ...others,
  ];
}

/**
 * Who hears about each learner for a purpose that only tells: those who
 * act for them, or the learner themself where no one does.
 */
export async function hearersFor(
  scope: ModuleScope,
  input: { studentIds: readonly string[]; on: string; purpose: ActingPurpose },
): Promise<ActingLink[]> {
  const others = await actorsFor(scope, input);
  const heard = new Set(others.map((link) => link.studentId));
  return [
    ...others,
    ...input.studentIds
      .filter((studentId) => !heard.has(studentId))
      .map((studentId) => ({ studentId, userId: studentId, linkId: null })),
  ];
}

/**
 * The learners a person answers for, for a purpose that signs, asks or
 * reports: themself, when they are one of the learners given and decide
 * for themselves, and those a module lets them act for.
 */
export async function learnersAnsweredBy(
  scope: ModuleScope,
  input: {
    userId: string;
    on: string;
    purpose: ActingPurpose;
    /** Whether the person is a learner of the school. */
    learner: boolean;
  },
): Promise<ActingLink[]> {
  const [others, deciding] = await Promise.all([
    learnersActedFor(scope, input),
    input.learner
      ? decidingLearners(scope, [input.userId], input.on)
      : Promise.resolve(new Set<string>()),
  ]);
  return [
    ...(deciding.has(input.userId)
      ? [{ studentId: input.userId, userId: input.userId, linkId: null }]
      : []),
    ...others,
  ];
}

/**
 * Who decides for each learner and takes the school's notices: those who
 * act for them for both, or the learner themself where no one does.
 */
export async function decidersTold(
  scope: ModuleScope,
  input: { studentIds: readonly string[]; on: string },
): Promise<ActingLink[]> {
  const [deciding, told] = await Promise.all([
    actorsFor(scope, { ...input, purpose: "decide" }),
    actorsFor(scope, { ...input, purpose: "notice" }),
  ]);
  const both = deciding.filter((link) =>
    told.some(
      (other) =>
        other.studentId === link.studentId && other.userId === link.userId,
    ),
  );
  const covered = new Set(both.map((link) => link.studentId));
  return [
    ...both,
    ...input.studentIds
      .filter((studentId) => !covered.has(studentId))
      .map((studentId) => ({ studentId, userId: studentId, linkId: null })),
  ];
}

/** Whether the person may decide for the learner: themself once they decide, or through a module that also lets them follow the learner. */
export async function decidesFor(
  scope: ModuleScope,
  input: { userId: string; studentId: string; on: string },
): Promise<boolean> {
  if (input.userId === input.studentId)
    return (await decidingLearners(scope, [input.studentId], input.on)).has(
      input.studentId,
    );
  const [deciding, following] = await Promise.all([
    learnersActedFor(scope, {
      userId: input.userId,
      on: input.on,
      purpose: "decide",
    }),
    learnersActedFor(scope, {
      userId: input.userId,
      on: input.on,
      purpose: "follow",
    }),
  ]);
  return (
    deciding.some((link) => link.studentId === input.studentId) &&
    following.some((link) => link.studentId === input.studentId)
  );
}

/** A module that keeps the link a consent was answered through. */
export interface ConsentLinks {
  keep(
    context: UnitContext,
    input: { consentId: string; linkId: string },
  ): Promise<void>;
}

export const consentLinks = point<ConsentLinks>("consent links");

/** Keeps the module's link a consent was answered through. */
export async function keepConsentLink(
  context: UnitContext,
  input: { consentId: string; linkId: string },
) {
  const keepers = await contributionsTo(context, consentLinks);
  if (keepers.length === 0) throw new Error("no module keeps the link");
  for (const keeper of keepers) await keeper.keep(context, input);
}
