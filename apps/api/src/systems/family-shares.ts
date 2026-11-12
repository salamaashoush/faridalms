import type { ContentDocument } from "@faridalms/domain/content";
import type { CommentAnchor } from "@faridalms/domain/coursework";

import {
  assessmentOf,
  commentsOf,
  courseworkHost,
  studentWork,
} from "@faridalms/database/stores/coursework";
import { documentOf } from "@faridalms/database/stores/documents";
import {
  sharedAmong,
  sharedWorkOf,
  shareAttempts,
  unshareAttempts,
} from "@faridalms/database/stores/family-shares";
import { withBlockIds } from "@faridalms/domain/content";
import {
  shareWorkSchema,
  sharedPieceSchema,
  sharedWorkQuerySchema,
} from "@faridalms/domain/coursework";
import { PAGE_SIZE } from "@faridalms/domain/paging";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { requireStudent } from "../core/reach";
import { taughtAssignment } from "../coursework/access";
import { readSharedAttempt } from "../coursework/family-shares";

const id = v.pipe(v.string(), v.uuid());

/** The pieces of an assignment's handed-in work shared with those who follow each student. */
export const ofAssignment = readProcedure
  .input(v.object({ assignmentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const assignment = await taughtAssignment(context, input.assignmentId);
    const work = await studentWork(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    });
    const shared = await sharedAmong(context.tx, {
      tenantId: context.tenantId,
      attemptIds: work.flatMap((row) => (row.attemptId ? [row.attemptId] : [])),
    });
    return work.flatMap((row) =>
      row.attemptId && shared.has(row.attemptId) ? [row.studentId] : [],
    );
  });

/** Shares some students' latest handed-in work with those who follow them, or takes it back. */
export const share = writeProcedure
  .input(shareWorkSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const assignment = await taughtAssignment(context, input.assignmentId);
    const work = await studentWork(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    });
    const handedIn = work.flatMap((row) =>
      input.studentIds.includes(row.studentId) && row.attemptId
        ? [{ attemptId: row.attemptId, studentId: row.studentId }]
        : [],
    );
    if (input.shared)
      await shareAttempts(context.tx, {
        tenantId: context.tenantId,
        shares: handedIn,
        userId: context.actor.userId,
      });
    else
      await unshareAttempts(context.tx, {
        tenantId: context.tenantId,
        attemptIds: handedIn.map((row) => row.attemptId),
      });
    await audit(context, {
      action: input.shared ? "submission.share" : "submission.unshare",
      objectType: "assignment",
      objectId: assignment.id,
      details: { students: handedIn.map((row) => row.studentId) },
    });
    return { changed: handedIn.length };
  });

/** The work teachers have shared about a learner the viewer follows, newest first. */
export const list = readProcedure
  .input(sharedWorkQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "children:read");
    await requireStudent(context, "teaching", input.studentId);
    return sharedWorkOf(context.tx, {
      tenantId: context.tenantId,
      studentId: input.studentId,
      limit: PAGE_SIZE,
      after: input.after,
    });
  });

/** One shared piece of work, as someone who follows the learner reads it. */
export const piece = readProcedure
  .input(sharedPieceSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "children:read");
    const host = { type: "submission_attempt", id: input.attemptId };
    const owner = await courseworkHost(context.tx, context.tenantId, host);
    if (
      !owner?.studentId ||
      !(await readSharedAttempt(context, {
        attemptId: input.attemptId,
        studentId: owner.studentId,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    const [document, assessment, comments] = await Promise.all([
      documentOf(context.tx, context.tenantId, host),
      assessmentOf(context.tx, context.tenantId, input.attemptId),
      commentsOf(context.tx, context.tenantId, input.attemptId),
    ]);
    const stored = (document?.content ?? null) as ContentDocument | null;
    const returned = Boolean(
      assessment?.releasedAt ?? assessment?.commentsReleasedAt,
    );
    return {
      content: stored ? withBlockIds(stored) : null,
      // The teacher's comments, once returned, without the student's answers
      // and replies, which stay between the student and the teacher.
      comments: returned
        ? comments.map((row) => ({
            ...row,
            anchor: row.anchor as unknown as CommentAnchor,
            studentState: null,
            replies: [],
          }))
        : [],
    };
  });
