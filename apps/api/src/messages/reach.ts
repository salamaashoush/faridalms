import type {
  MessageReach,
  Messageable,
  RecipientFilter,
  RecipientRow,
} from "@faridalms/database/stores/messages";
import type { RecipientCursor } from "@faridalms/domain/messages";

import {
  messageableRows,
  recipientPage,
  unreachable,
} from "@faridalms/database/stores/messages";
import { namesOf } from "@faridalms/database/stores/persons";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";
import { scopeFor } from "../core/reach";
import { decidingLearners, learnersActedFor } from "../people/acting";

/**
 * People a module lets the viewer write to beside staff and students: a
 * rank of its own in the recipients, and which of some people it reaches.
 */
export interface RecipientSource {
  rows(
    context: UnitContext,
    reach: MessageReach,
    filter: RecipientFilter,
  ): Promise<RecipientRow[]>;
  reachable(
    context: UnitContext,
    reach: MessageReach,
    userIds: readonly string[],
  ): Promise<string[]>;
}

export const recipientSources = point<RecipientSource>("recipient sources");

/**
 * What the viewer's messages reach today: the learners they act for in the
 * school's messages, and the office, which whoever acts for a learner may
 * write to, a learner who decides for themself included.
 */
export async function messageReach(
  context: UnitContext,
): Promise<MessageReach> {
  const [links, deciding] = await Promise.all([
    learnersActedFor(context, {
      userId: context.actor.userId,
      on: context.today,
      purpose: "contact",
    }),
    context.actor.context === "student"
      ? decidingLearners(context, [context.actor.userId], context.today)
      : Promise.resolve(new Set<string>()),
  ]);
  const learners = [...new Set(links.map((link) => link.studentId))];
  return {
    ...scopeFor(context, "classes"),
    learners,
    office: learners.length > 0 || deciding.has(context.actor.userId),
  };
}

/** A page of the people the viewer may write to, from core and every module on. */
export async function recipientsFor(
  context: UnitContext,
  filter: {
    q: string;
    limit: number;
    after: RecipientCursor | null;
    among?: "all" | "people" | "students";
    ids?: readonly string[];
  },
): Promise<{ rows: Messageable[]; next: RecipientCursor | null }> {
  const reach = await messageReach(context);
  const sources = await contributionsTo(context, recipientSources);
  const found = await Promise.all([
    messageableRows(context.tx, reach, filter),
    ...sources.map((source) => source.rows(context, reach, filter)),
  ]);
  return recipientPage(found, filter.limit);
}

/** Which of these people the viewer may not write to. */
export async function unreachableFor(
  context: UnitContext,
  userIds: readonly string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const reach = await messageReach(context);
  const outside = await unreachable(context.tx, reach, userIds);
  if (outside.length === 0) return outside;
  const opened = new Set(
    (
      await Promise.all(
        (await contributionsTo(context, recipientSources)).map((source) =>
          source.reachable(context, reach, outside),
        ),
      )
    ).flat(),
  );
  return outside.filter((id) => !opened.has(id));
}

/** The learners the viewer may say a message is about: those they act for in the school's messages. */
export async function learnersToName(context: UnitContext) {
  const reach = await messageReach(context);
  const names = await namesOf(context.tx, context.tenantId, reach.learners);
  return names.map((row) => ({
    userId: row.id,
    fullNameEn: row.fullNameEn,
    fullNameAr: row.fullNameAr,
  }));
}
