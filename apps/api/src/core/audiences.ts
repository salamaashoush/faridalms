import type {
  Audience,
  AudienceOwner,
  Reach,
} from "@faridalms/database/stores/audiences";
import type { AudienceScope } from "@faridalms/database/tables/broadcasts";
import type { AudienceInput } from "@faridalms/domain/announcements";

import {
  audiencesOf,
  audienceUsers,
  reachOf,
  setAudiences,
  studentsHeardFor,
} from "@faridalms/database/stores/audiences";
import { classesRunning } from "@faridalms/database/stores/classes";
import { AUDIENCE_SCOPES } from "@faridalms/domain/announcements";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";
import type { ModuleScope } from "./extension";

import { actorsFor, learnersActedFor } from "../people/acting";
import { contributionsTo, point } from "./extension";
import { can } from "./procedure";

/** What an audience of a module's kind names: a grade, say. */
export interface AudienceTarget {
  id: string;
  labelEn: string | null;
  labelAr: string | null;
}

/**
 * An audience a module offers under its scope, kept in its own tables: what
 * it may name, what an announcement or event names under it, and the
 * classes those cover, whose students, teachers and those who act for the
 * students it reaches as a class audience reaches its own.
 */
export interface AudienceKind {
  scope: string;
  choices(context: UnitContext): Promise<AudienceTarget[]>;
  targetsOf(
    context: ModuleScope,
    owner: AudienceOwner,
  ): Promise<AudienceTarget[]>;
  save(
    context: UnitContext,
    owner: AudienceOwner,
    targetIds: readonly string[],
  ): Promise<void>;
  classesOf(context: ModuleScope, owner: AudienceOwner): Promise<string[]>;
  /** Of the announcements or events, those whose audiences of the kind cover one of the classes. */
  ownersCovering(
    context: ModuleScope,
    kind: AudienceOwner["kind"],
    classIds: readonly string[],
  ): Promise<string[]>;
  /** People the kind reaches on a day beside its classes' own. */
  peopleOf?(
    context: ModuleScope,
    owner: AudienceOwner,
    on: string,
  ): Promise<string[]>;
  /** Of the announcements or events, those the kind names the person in, beside their classes. */
  ownersNaming?(
    context: ModuleScope,
    kind: AudienceOwner["kind"],
    input: { userId: string; on: string },
  ): Promise<string[]>;
}

export const audienceKinds = point<AudienceKind>("audience kinds");

/** One audience as a list shows it: a scope of the school's own or a module's, and what it names. */
export interface AudienceEntry {
  scope: string;
  classId: string | null;
  targetId: string | null;
  classCode: string | null;
  classTitleEn: string | null;
  classTitleAr: string | null;
  labelEn: string | null;
  labelAr: string | null;
}

const isCore = (scope: string): scope is AudienceScope =>
  (AUDIENCE_SCOPES as readonly string[]).includes(scope);

/** The classes running today a broadcast can go to, and what each module's audiences may name. */
export async function audienceChoices(context: UnitContext) {
  const [classes, kinds] = await Promise.all([
    classesRunning(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      on: context.today,
    }),
    contributionsTo(context, audienceKinds),
  ]);
  return {
    classes,
    kinds: await Promise.all(
      kinds.map(async (kind) => ({
        scope: kind.scope,
        options: await kind.choices(context),
      })),
    ),
  };
}

/** An announcement's or event's audiences, the school's own first, then each module's on. */
export async function audiencesAt(
  context: ModuleScope,
  owner: AudienceOwner,
): Promise<AudienceEntry[]> {
  const own = await audiencesOf(context.tx, context.tenantId, owner);
  const entries: AudienceEntry[] = own.map((row) => ({
    scope: row.scope,
    classId: row.classId,
    targetId: null,
    classCode: row.classCode,
    classTitleEn: row.classTitleEn,
    classTitleAr: row.classTitleAr,
    labelEn: null,
    labelAr: null,
  }));
  for (const kind of await contributionsTo(context, audienceKinds))
    for (const target of await kind.targetsOf(context, owner))
      entries.push({
        scope: kind.scope,
        classId: null,
        targetId: target.id,
        classCode: null,
        classTitleEn: null,
        classTitleAr: null,
        labelEn: target.labelEn,
        labelAr: target.labelAr,
      });
  return entries;
}

/**
 * Replaces an announcement's or event's audiences: the school's own scopes
 * in its table, each module's in its own. A scope no module on answers for
 * is refused.
 */
export async function saveAudiences(
  context: UnitContext,
  owner: AudienceOwner,
  inputs: readonly AudienceInput[],
) {
  const kinds = await contributionsTo(context, audienceKinds);
  if (
    inputs.some(
      (input) =>
        !isCore(input.scope) &&
        !kinds.some((kind) => kind.scope === input.scope),
    )
  )
    throw new ORPCError("BAD_REQUEST", {
      message: "announcements.audience_target",
    });
  const own: Audience[] = inputs.flatMap((input) =>
    isCore(input.scope)
      ? [{ scope: input.scope, classId: input.classId || null }]
      : [],
  );
  await setAudiences(context.tx, {
    tenantId: context.tenantId,
    owner,
    audiences: own,
  });
  for (const kind of kinds)
    await kind.save(
      context,
      owner,
      inputs
        .filter((input) => input.scope === kind.scope)
        .map((input) => input.targetId),
    );
}

/** The audiences of one announcement or event as the inputs that save them again on another. */
export const audienceInputs = (
  entries: readonly AudienceEntry[],
): AudienceInput[] =>
  entries.map((entry) => ({
    scope: entry.scope,
    classId: entry.classId ?? "",
    targetId: entry.targetId ?? "",
  }));

/**
 * Everyone an announcement's or event's audiences reach on a day: staff,
 * students and teachers, those who act for the students of the school's
 * and a class's audiences in the school's messages, and whom each module's
 * audiences reach besides.
 */
export async function audiencePeople(
  context: ModuleScope,
  owner: AudienceOwner,
  on: string,
): Promise<string[]> {
  const own = await audiencesOf(context.tx, context.tenantId, owner);
  const classIds = new Set<string>();
  const besides: string[] = [];
  for (const kind of await contributionsTo(context, audienceKinds)) {
    for (const id of await kind.classesOf(context, owner)) classIds.add(id);
    if (kind.peopleOf)
      besides.push(...(await kind.peopleOf(context, owner, on)));
  }
  const where = { tenantId: context.tenantId, schoolId: context.schoolId, on };
  const [people, heard] = await Promise.all([
    audienceUsers(context.tx, where, own, [...classIds]),
    studentsHeardFor(context.tx, where, own, [...classIds]),
  ]);
  const actors = await actorsFor(context, {
    studentIds: heard,
    on,
    purpose: "contact",
  });
  return [
    ...new Set([...people, ...actors.map((link) => link.userId), ...besides]),
  ];
}

/**
 * Who a person is to the audiences on a day, with the announcements and
 * events the modules' audiences name them in through their classes.
 */
export async function reachAt(
  context: ModuleScope,
  input: { userId: string; on: string },
): Promise<Reach> {
  const learners = await learnersActedFor(context, {
    userId: input.userId,
    on: input.on,
    purpose: "contact",
  });
  const reach = await reachOf(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    userId: input.userId,
    on: input.on,
    learners: learners.map((link) => link.studentId),
  });
  for (const kind of await contributionsTo(context, audienceKinds))
    for (const owned of ["broadcast", "calendar_event"] as const) {
      reach.owners[owned].push(
        ...(await kind.ownersCovering(context, owned, reach.classIds)),
      );
      if (kind.ownersNaming)
        reach.owners[owned].push(
          ...(await kind.ownersNaming(context, owned, input)),
        );
    }
  return reach;
}

/** Who the viewer is to the calendar's audience scopes today; managers see every event. */
export async function calendarReach(context: UnitContext) {
  if (can(context, "calendar:manage")) return null;
  return reachAt(context, {
    userId: context.actor.userId,
    on: context.today,
  });
}
