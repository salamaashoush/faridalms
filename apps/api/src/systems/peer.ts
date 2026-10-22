import type { ContentDocument } from "@faridalms/domain/content";
import type { Rubric } from "@faridalms/domain/coursework";

import {
  assignmentById,
  isRecipient,
  namesOf,
  studentWork,
} from "@faridalms/database/stores/coursework";
import { documentOf } from "@faridalms/database/stores/documents";
import { filesOfHost } from "@faridalms/database/stores/files";
import {
  hidePeerReview,
  insertPeerReviews,
  markPeerReview,
  peerReviewById,
  peerReviewsOf,
  sendPeerReview,
} from "@faridalms/database/stores/peer-reviews";
import {
  hidePeerReviewSchema,
  peerReviewInputSchema,
} from "@faridalms/domain/coursework";
import { allocateReviews } from "@faridalms/domain/peer-review";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { requireOpenYear, taughtAssignment } from "../core/coursework-access";
import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

const byAssignment = v.object({ assignmentId: v.pipe(v.string(), v.uuid()) });

type Reviews = Awaited<ReturnType<typeof peerReviewsOf>>;

/** An assignment whose work its classmates review, for its teacher. */
async function reviewedAssignment(context: UnitContext, assignmentId: string) {
  requireCapability(context, "submissions:grade");
  const assignment = await taughtAssignment(context, assignmentId);
  if (assignment.peerReviews === null)
    throw new ORPCError("BAD_REQUEST", { message: "coursework.peer_off" });
  return assignment;
}

/** Each student's latest handed-in attempt, leaving out excused work. */
async function handedIn(context: UnitContext, assignmentId: string) {
  return (
    await studentWork(context.tx, {
      tenantId: context.tenantId,
      assignmentId,
    })
  ).flatMap((row) =>
    row.attemptId && !row.excused
      ? [{ studentId: row.studentId, attemptId: row.attemptId }]
      : [],
  );
}

/**
 * A number for each review on one side, in the order they were handed
 * out: what an anonymous reviewer or author goes by.
 */
const numbered = (reviews: Reviews, side: "reviewerId" | "authorId") => {
  const seen = new Map<string, number>();
  return new Map(
    reviews.map((review) => {
      const count = (seen.get(review[side]) ?? 0) + 1;
      seen.set(review[side], count);
      return [review.id, count];
    }),
  );
};

/**
 * Peer review of an assignment as its teacher runs it: who reviews whom,
 * what each wrote, and how much handed-in work waits to join.
 */
export const overview = readProcedure
  .input(byAssignment)
  .handler(async ({ input, context }) => {
    const assignment = await reviewedAssignment(context, input.assignmentId);
    const [reviews, work] = await Promise.all([
      peerReviewsOf(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
      }),
      handedIn(context, assignment.id),
    ]);
    const placed = new Set(
      reviews.flatMap((review) => [review.reviewerId, review.authorId]),
    );
    const students = await namesOf(context.tx, context.tenantId, [
      ...new Set([...placed, ...work.map((row) => row.studentId)]),
    ]);
    return {
      reviews: assignment.peerReviews,
      anonymous: assignment.peerAnonymous ?? true,
      startedAt: assignment.peerStartedAt,
      releasedAt: assignment.peerReleasedAt,
      rubric: assignment.rubric as unknown as Rubric | null,
      handedIn: work.length,
      waiting: work.filter((row) => !placed.has(row.studentId)).length,
      students,
      given: reviews.map((review) => ({
        id: review.id,
        reviewerId: review.reviewerId,
        authorId: review.authorId,
        rubricScores: review.rubricScores,
        strengths: review.strengths,
        suggestion: review.suggestion,
        sentAt: review.sentAt,
        hidden: review.hiddenAt !== null,
      })),
    };
  });

/**
 * Hands reviews out among the students whose work is in, or brings work
 * handed in since into the review.
 */
export const start = writeProcedure
  .input(byAssignment)
  .handler(async ({ input, context }) => {
    const assignment = await reviewedAssignment(context, input.assignmentId);
    await requireOpenYear(context, assignment.schoolYearId);
    if (assignment.state !== "published")
      throw new ORPCError("BAD_REQUEST", { message: "coursework.peer_draft" });
    const [reviews, work] = await Promise.all([
      peerReviewsOf(context.tx, {
        tenantId: context.tenantId,
        assignmentId: assignment.id,
      }),
      handedIn(context, assignment.id),
    ]);
    const attempts = new Map(work.map((row) => [row.studentId, row.attemptId]));
    const added = allocateReviews({
      existing: reviews,
      students: work.map((row) => row.studentId),
      reviews: assignment.peerReviews ?? 1,
    });
    if (added.length === 0 && !assignment.peerStartedAt)
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.peer_too_few",
      });
    await insertPeerReviews(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      reviews: added.map((pair) => ({
        ...pair,
        attemptId: attempts.get(pair.authorId) ?? "",
      })),
    });
    await markPeerReview(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      stage: "started",
    });
    await audit(context, {
      action: "peer_review.start",
      objectType: "assignment",
      objectId: assignment.id,
      details: { added: added.length },
    });
    return { added: added.length };
  });

/** Lets the authors read the reviews of their work, all but those hidden. */
export const release = writeProcedure
  .input(byAssignment)
  .handler(async ({ input, context }) => {
    const assignment = await reviewedAssignment(context, input.assignmentId);
    await requireOpenYear(context, assignment.schoolYearId);
    if (!assignment.peerStartedAt)
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.peer_not_started",
      });
    await markPeerReview(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      stage: "released",
    });
    await audit(context, {
      action: "peer_review.release",
      objectType: "assignment",
      objectId: assignment.id,
    });
    return {};
  });

/** A teacher keeps a review from its author, unkind or wrong, or lets it through. */
export const hide = writeProcedure
  .input(hidePeerReviewSchema)
  .handler(async ({ input, context }) => {
    const review = await peerReviewById(
      context.tx,
      context.tenantId,
      input.reviewId,
    );
    if (!review) throw new ORPCError("NOT_FOUND");
    const assignment = await reviewedAssignment(context, review.assignmentId);
    await requireOpenYear(context, assignment.schoolYearId);
    await hidePeerReview(context.tx, {
      tenantId: context.tenantId,
      id: review.id,
      hiddenBy: input.hidden ? context.actor.userId : null,
    });
    await audit(context, {
      action: input.hidden ? "peer_review.hide" : "peer_review.show",
      objectType: "assignment",
      objectId: assignment.id,
      subjectUserId: review.reviewerId,
      details: { reviewId: review.id },
    });
    return {};
  });

/** An assignment the student was set, whose work classmates review. */
async function learnerReviewed(context: UnitContext, assignmentId: string) {
  requireCapability(context, "own-work:read");
  const assignment = await assignmentById(
    context.tx,
    context.tenantId,
    assignmentId,
  );
  if (
    !assignment ||
    assignment.state !== "published" ||
    assignment.peerReviews === null ||
    !(await isRecipient(
      context.tx,
      context.tenantId,
      assignment.id,
      context.actor.userId,
    ))
  )
    throw new ORPCError("NOT_FOUND");
  return assignment;
}

/**
 * Peer review as a student meets it: the classmates' work they were given
 * to review, with what they wrote, and, once released, what classmates
 * wrote of theirs. Anonymous, each side goes by a number.
 */
export const mine = readProcedure
  .input(byAssignment)
  .handler(async ({ input, context }) => {
    const assignment = await learnerReviewed(context, input.assignmentId);
    const me = context.actor.userId;
    const reviews = await peerReviewsOf(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    });
    const anonymous = assignment.peerAnonymous ?? true;
    const toGive = reviews.filter((review) => review.reviewerId === me);
    const received = assignment.peerReleasedAt
      ? reviews.filter(
          (review) =>
            review.authorId === me &&
            review.sentAt !== null &&
            review.hiddenAt === null,
        )
      : [];
    const names = new Map(
      anonymous
        ? []
        : (
            await namesOf(context.tx, context.tenantId, [
              ...toGive.map((review) => review.authorId),
              ...received.map((review) => review.reviewerId),
            ])
          ).map((row) => [row.id, row]),
    );
    const works = numbered(reviews, "reviewerId");
    const reviewers = numbered(reviews, "authorId");
    return {
      anonymous,
      reviews: assignment.peerReviews,
      started: assignment.peerStartedAt !== null,
      released: assignment.peerReleasedAt !== null,
      rubric: assignment.rubric as unknown as Rubric | null,
      toGive: await Promise.all(
        toGive.map(async (review) => {
          const host = { type: "submission_attempt", id: review.attemptId };
          const [document, files] = await Promise.all([
            documentOf(context.tx, context.tenantId, host),
            filesOfHost(context.tx, context.tenantId, host),
          ]);
          const content = (document?.content ?? null) as ContentDocument | null;
          return {
            id: review.id,
            number: works.get(review.id) ?? 0,
            author: names.get(review.authorId) ?? null,
            content,
            files: files.map((file) => ({
              id: file.id,
              name: file.name,
              mediaType: file.mediaType,
              sizeBytes: file.sizeBytes,
            })),
            rubricScores: review.rubricScores,
            strengths: review.strengths,
            suggestion: review.suggestion,
            sentAt: review.sentAt,
          };
        }),
      ),
      received: received.map((review) => ({
        id: review.id,
        number: reviewers.get(review.id) ?? 0,
        reviewer: names.get(review.reviewerId) ?? null,
        rubricScores: review.rubricScores,
        strengths: review.strengths,
        suggestion: review.suggestion,
      })),
    };
  });

/**
 * A student sends their review of a classmate's work: a level for each
 * criterion when the work has a rubric, and both prompts. They may change
 * it until the teacher releases the reviews.
 */
export const send = writeProcedure
  .input(peerReviewInputSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "own-work:submit");
    const review = await peerReviewById(
      context.tx,
      context.tenantId,
      input.reviewId,
    );
    if (!review || review.reviewerId !== context.actor.userId)
      throw new ORPCError("NOT_FOUND");
    const assignment = await learnerReviewed(context, review.assignmentId);
    await requireOpenYear(context, assignment.schoolYearId);
    if (assignment.peerReleasedAt)
      throw new ORPCError("CONFLICT", { message: "coursework.peer_released" });
    const rubric = assignment.rubric as unknown as Rubric | null;
    const scored = Object.entries(input.rubricScores);
    if (
      rubric
        ? scored.length !== rubric.criteria.length ||
          rubric.criteria.some(
            (criterion) =>
              !criterion.levels.some(
                (level) => level.id === input.rubricScores[criterion.id],
              ),
          )
        : scored.length > 0
    )
      throw new ORPCError("BAD_REQUEST", { message: "coursework.peer_rubric" });
    await sendPeerReview(context.tx, {
      tenantId: context.tenantId,
      id: review.id,
      rubricScores: input.rubricScores,
      strengths: input.strengths,
      suggestion: input.suggestion,
    });
    await audit(context, {
      action: "peer_review.send",
      objectType: "assignment",
      objectId: assignment.id,
      details: { reviewId: review.id },
    });
    return {};
  });
