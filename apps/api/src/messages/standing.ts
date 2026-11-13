import type { Reader, ThreadRow } from "@faridalms/database/stores/messages";

import { standingMembers } from "@faridalms/database/stores/messages";
import { mailboxesOf } from "@faridalms/domain/messages";

import type { UnitContext } from "../core/context";
import type { ConversationScope } from "./conversations";

import { schoolWideHolders, staffStanding } from "../core/reach";
import { actorsFor, learnersActedFor } from "../people/acting";

/**
 * Who the viewer reads conversations as, with their standing today to the
 * learners conversations are about: the learners they act for in the
 * school's messages, which the module that knows applies its custody and
 * "do not contact" rules to, and their reach as staff when they read as
 * staff.
 */
export async function readerOf(context: UnitContext): Promise<Reader> {
  const acted = await learnersActedFor(context, {
    userId: context.actor.userId,
    on: context.today,
    purpose: "contact",
  });
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    viewerId: context.actor.userId,
    mailboxes: mailboxesOf(context.actor.capabilities).reads,
    standing: {
      today: context.today,
      actsFor: [...new Set(acted.map((link) => link.studentId))],
      staff: staffStanding(context),
    },
  };
}

/** The viewer as a reader of their own conversations, leaving out those of their teams' mailboxes. */
export async function personalReader(context: UnitContext): Promise<Reader> {
  return { ...(await readerOf(context)), mailboxes: [] };
}

/** The people in a conversation with a standing to it today, so only they hear of it. */
export async function standingIn(
  scope: ConversationScope,
  thread: ThreadRow,
): Promise<Set<string> | null> {
  if (!thread.studentId) return null;
  const [actors, everyLearner] = await Promise.all([
    actorsFor(scope, {
      studentIds: [thread.studentId],
      on: scope.today,
      purpose: "contact",
    }),
    schoolWideHolders(scope, "classes"),
  ]);
  return standingMembers(scope.tx, {
    tenantId: scope.tenantId,
    schoolId: scope.schoolId,
    threadId: thread.id,
    today: scope.today,
    actors: actors.map((link) => link.userId),
    everyLearner,
  });
}
