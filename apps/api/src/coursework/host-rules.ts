import {
  assessmentOf,
  assignmentById,
  courseworkHost,
  isRecipient,
  openedUntold,
  studentWork,
} from "@faridalms/database/stores/coursework";
import { questionAskedOf } from "@faridalms/database/stores/quizzes";

import type { UnitContext } from "../core/context";
import type { FileHost } from "../files/authorize";

import { can } from "../core/procedure";
import { tellLive } from "../core/publication";
import { reachesStudent, teaches } from "../core/reach";
import { passes } from "../files/authorize";
import { learnerAssignment, taughtAssignment } from "./access";
import { COURSEWORK_GO_LIVES } from "./hosts";
import { tellAssigned } from "./notices";
import { readsAttempt, readsSubmissionFile } from "./points";

/** Who reads and writes coursework's records and the files they hold. */
export const WORK_HOSTS: FileHost[] = [];

async function readable(
  context: UnitContext,
  host: { type: string; id: string },
): Promise<boolean> {
  const owner = await courseworkHost(context.tx, context.tenantId, host);
  if (!owner) return false;
  const teacher =
    (can(context, "assignments:author") || can(context, "submissions:grade")) &&
    (await teaches(context, "teaching", owner.classId));
  if (host.type === "submission")
    return owner.studentId === context.actor.userId;
  if (teacher) return true;
  // A classmate reads handed-in work once it was given them to review, and
  // anyone else only as a module lets them.
  if (host.type === "submission_attempt")
    return (
      owner.studentId === context.actor.userId ||
      (owner.studentId !== null &&
        (await readsAttempt(context, {
          attemptId: host.id,
          studentId: owner.studentId,
        })))
    );
  if (
    await isRecipient(
      context.tx,
      context.tenantId,
      owner.assignmentId,
      context.actor.userId,
    )
  )
    return true;
  if (!can(context, "children:read")) return false;
  const work = await studentWork(context.tx, {
    tenantId: context.tenantId,
    assignmentId: owner.assignmentId,
  });
  for (const row of work)
    if (await reachesStudent(context, "teaching", row.studentId)) return true;
  return false;
}

WORK_HOSTS.push({
  hostType: "assignment",
  read: (context, hostId) =>
    readable(context, { type: "assignment", id: hostId }),
  write: async (context, hostId) =>
    can(context, "assignments:author") &&
    (await passes(taughtAssignment)(context, hostId)),
  live: {
    keyed: async (context, hostId) =>
      (await assignmentById(context.tx, context.tenantId, hostId))
        ?.submissionFormat === "quiz",
  },
  openWork: passes(learnerAssignment),
});
/**
 * A class's file area holds what its teachers put in its assignments'
 * documents, shown wherever the class uses it rather than copied each time.
 * Its teachers read all of it; students and families only what a document
 * they may read shows.
 */
WORK_HOSTS.push({
  hostType: "class",
  area: {
    reader: async (context, classId) =>
      (can(context, "assignments:author") ||
        can(context, "submissions:grade")) &&
      (await teaches(context, "teaching", classId)),
    writer: async (context, classId) =>
      can(context, "assignments:author") &&
      (await teaches(context, "teaching", classId)),
    holders: {
      assignment: async (context, assignmentId) => {
        const owner = await courseworkHost(context.tx, context.tenantId, {
          type: "assignment",
          id: assignmentId,
        });
        return owner ? { type: "class", id: owner.classId } : null;
      },
    },
  },
});

/**
 * Work assigned to open later goes live when it opens: its students and
 * their families are told as its teacher would have been heard on assigning
 * it, and so is anyone its brief mentions.
 */
COURSEWORK_GO_LIVES.push({
  due: (tx, input) => openedUntold(tx, input),
  schoolOf: (row) => row.orgId,
  authorOf: (row) => row.authorUserId,
  live: async (scope, row) => {
    await tellAssigned(scope, row);
    await tellLive(
      scope,
      { type: "assignment", id: row.id },
      {
        title: row.title,
      },
    );
  },
});
WORK_HOSTS.push({
  hostType: "submission",
  read: async (context, hostId, file) =>
    (await readable(context, { type: "submission", id: hostId })) ||
    (file !== undefined &&
      (await readsSubmissionFile(context, {
        submissionId: hostId,
        fileId: file.id,
      }))),
});
WORK_HOSTS.push({
  hostType: "submission_attempt",
  read: (context, hostId) =>
    readable(context, { type: "submission_attempt", id: hostId }),
});
// A grader's voice feedback on an attempt: its graders hear it at once,
// whoever reads the attempt hears it once the work is returned.
WORK_HOSTS.push({
  hostType: "attempt_feedback",
  read: async (context, attemptId) => {
    const host = { type: "submission_attempt", id: attemptId };
    if (!(await readable(context, host))) return false;
    const owner = await courseworkHost(context.tx, context.tenantId, host);
    if (
      owner &&
      can(context, "submissions:grade") &&
      (await teaches(context, "teaching", owner.classId))
    )
      return true;
    const assessment = await assessmentOf(
      context.tx,
      context.tenantId,
      attemptId,
    );
    return Boolean(assessment?.releasedAt ?? assessment?.commentsReleasedAt);
  },
});

/** Whether a quiz asked the viewer the question, or one in a class they teach. */
export async function askedOrTaught(context: UnitContext, id: string) {
  const asked = await questionAskedOf(context.tx, {
    tenantId: context.tenantId,
    bankQuestionId: id,
    orgId: context.schoolId,
  });
  if (asked.some((row) => row.studentId === context.actor.userId)) return true;
  if (!can(context, "submissions:grade")) return false;
  const classes = [...new Set(asked.map((row) => row.classId))];
  const taught = await Promise.all(
    classes.map((classId) => teaches(context, "teaching", classId)),
  );
  return taught.some(Boolean);
}
