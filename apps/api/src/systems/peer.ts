import type { AssignmentRow } from "@faridalms/database/stores/coursework";
import type { PeerReviewRow } from "@faridalms/database/stores/peer-reviews";
import type { ContentDocument } from "@faridalms/domain/content";
import type { CommentAnchor, Rubric } from "@faridalms/domain/coursework";

import {
  assignmentById,
  attemptById,
  discussionPostsOf,
  isRecipient,
  namesOf,
  studentWork,
} from "@faridalms/database/stores/coursework";
import { documentOf } from "@faridalms/database/stores/documents";
import { filesOfHost } from "@faridalms/database/stores/files";
import {
  hidePeerReview,
  insertPeerComment,
  insertPeerReviews,
  markPeerReview,
  peerCommentById,
  peerCommentsOf,
  peerReviewById,
  peerReviewsOf,
  ratePeerReview,
  removePeerComment,
  sendPeerReview,
} from "@faridalms/database/stores/peer-reviews";
import { quizAnswersOf } from "@faridalms/database/stores/quizzes";
import { withBlockIds, wordsAt } from "@faridalms/domain/content";
import {
  hidePeerReviewSchema,
  peerCommentSchema,
  peerReviewInputSchema,
  ratePeerReviewSchema,
  removePeerCommentSchema,
} from "@faridalms/domain/coursework";
import { quoteOf } from "@faridalms/domain/document-comments";
import { checkBlocks, isTeacherMarked } from "@faridalms/domain/learning";
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
import { teachingScope, tellReviewers } from "../core/teaching-notices";
import { attemptQuizzes, publishedQuiz } from "../quizzes/quiz";

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

/** The passage comments of these reviews, by review, each with the words it points at. */
async function commentsByReview(
  context: UnitContext,
  reviews: readonly { id: string; attemptId: string }[],
) {
  const rows = await peerCommentsOf(context.tx, {
    tenantId: context.tenantId,
    reviewIds: reviews.map((review) => review.id),
  });
  const attempts = new Map(
    reviews.map((review) => [review.id, review.attemptId]),
  );
  const works = new Map(
    await Promise.all(
      [...new Set(rows.map((row) => attempts.get(row.reviewId) ?? ""))].map(
        async (attemptId) => {
          const document = await documentOf(context.tx, context.tenantId, {
            type: "submission_attempt",
            id: attemptId,
          });
          const content = document?.content as ContentDocument | undefined;
          return [attemptId, content ? withBlockIds(content) : null] as const;
        },
      ),
    ),
  );
  return Map.groupBy(
    rows.map((row) => {
      const anchor = row.anchor as unknown as CommentAnchor;
      const work = works.get(attempts.get(row.reviewId) ?? "");
      return {
        id: row.id,
        reviewId: row.reviewId,
        anchor,
        words: work ? quoteOf(wordsAt(work, anchor)) : "",
        body: row.body,
      };
    }),
    (row) => row.reviewId,
  );
}

/**
 * What a reviewer reads of a classmate's work: the page and files they
 * handed in, a quiz's answers only a teacher can mark, or what they posted
 * in a discussion, hidden posts left out.
 */
async function workUnderReview(
  context: UnitContext,
  assignment: AssignmentRow,
  review: PeerReviewRow,
) {
  const none = {
    content: null as ContentDocument | null,
    files: [] as {
      id: string;
      name: string;
      mediaType: string;
      sizeBytes: number;
    }[],
    answers: [] as { blockId: string; prompt: string; text: string }[],
    posts: [] as {
      id: string;
      reply: boolean;
      content: ContentDocument;
      createdAt: string;
    }[],
  };
  if (assignment.submissionFormat === "quiz") {
    const [attempt, document] = await Promise.all([
      attemptById(context.tx, context.tenantId, review.attemptId),
      publishedQuiz(context, assignment.id),
    ]);
    if (!attempt || !document) return none;
    const [quizzes, answers] = await Promise.all([
      attemptQuizzes(context, document, attempt.submissionId),
      quizAnswersOf(context.tx, {
        tenantId: context.tenantId,
        submissionId: attempt.submissionId,
        attempt: attempt.number,
      }),
    ]);
    return {
      ...none,
      answers: checkBlocks(quizzes.of(attempt.number))
        .filter(isTeacherMarked)
        .map((block) => {
          const response = answers.find(
            (answer) => answer.blockId === block.id,
          )?.response;
          return {
            blockId: block.id,
            prompt: block.prompt,
            text: typeof response?.text === "string" ? response.text : "",
          };
        }),
    };
  }
  if (assignment.submissionFormat === "discussion") {
    const posts = await discussionPostsOf(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    });
    return {
      ...none,
      posts: posts
        .filter(
          (post) =>
            post.authorUserId === review.authorId &&
            !post.hidden &&
            !post.redacted,
        )
        .map((post) => ({
          id: post.id,
          reply: post.parentPostId !== null,
          content: post.content as unknown as ContentDocument,
          createdAt: post.createdAt,
        })),
    };
  }
  const host = { type: "submission_attempt", id: review.attemptId };
  const [document, files] = await Promise.all([
    documentOf(context.tx, context.tenantId, host),
    filesOfHost(context.tx, context.tenantId, host),
  ]);
  return {
    ...none,
    content: document?.content
      ? withBlockIds(document.content as unknown as ContentDocument)
      : null,
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
    })),
  };
}

/**
 * Peer review of an assignment as its teacher runs it: who reviews whom,
 * what each wrote and how helpful its author found it, and how much
 * handed-in work waits to join.
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
    const [students, comments] = await Promise.all([
      namesOf(context.tx, context.tenantId, [
        ...new Set([...placed, ...work.map((row) => row.studentId)]),
      ]),
      commentsByReview(context, reviews),
    ]);
    return {
      reviews: assignment.peerReviews,
      anonymous: assignment.peerAnonymous ?? true,
      startedAt: assignment.peerStartedAt,
      releasedAt: assignment.peerReleasedAt,
      dueAt: assignment.peerDueAt,
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
        helpfulness: review.helpfulness,
        comments: comments.get(review.id) ?? [],
      })),
    };
  });

/**
 * Hands reviews out among the students whose work is in, or brings work
 * handed in since into the review, and tells each reviewer given work.
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
    await tellReviewers(
      teachingScope(context),
      assignment,
      [...new Set(added.map((pair) => pair.reviewerId))],
      "assignment",
    );
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
 * to review, with what they wrote and the passages they commented on, and,
 * once released, what classmates wrote of theirs. Anonymous, each side
 * goes by a number.
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
    const [named, comments] = await Promise.all([
      anonymous
        ? []
        : namesOf(context.tx, context.tenantId, [
            ...toGive.map((review) => review.authorId),
            ...received.map((review) => review.reviewerId),
          ]),
      commentsByReview(context, [...toGive, ...received]),
    ]);
    const names = new Map(named.map((row) => [row.id, row]));
    const works = numbered(reviews, "reviewerId");
    const reviewers = numbered(reviews, "authorId");
    return {
      anonymous,
      reviews: assignment.peerReviews,
      started: assignment.peerStartedAt !== null,
      released: assignment.peerReleasedAt !== null,
      dueAt: assignment.peerDueAt,
      rubric: assignment.rubric as unknown as Rubric | null,
      toGive: await Promise.all(
        toGive.map(async (review) => ({
          id: review.id,
          number: works.get(review.id) ?? 0,
          author: names.get(review.authorId) ?? null,
          ...(await workUnderReview(context, assignment, review)),
          comments: comments.get(review.id) ?? [],
          rubricScores: review.rubricScores,
          strengths: review.strengths,
          suggestion: review.suggestion,
          sentAt: review.sentAt,
          helpfulness: review.helpfulness,
        })),
      ),
      received: received.map((review) => ({
        id: review.id,
        number: reviewers.get(review.id) ?? 0,
        reviewer: names.get(review.reviewerId) ?? null,
        rubricScores: review.rubricScores,
        strengths: review.strengths,
        suggestion: review.suggestion,
        comments: comments.get(review.id) ?? [],
        helpfulness: review.helpfulness,
      })),
    };
  });

/** A review the student was given to write, while the reviews are not yet released. */
async function ownReview(context: UnitContext, reviewId: string) {
  requireCapability(context, "own-work:submit");
  const review = await peerReviewById(context.tx, context.tenantId, reviewId);
  if (!review || review.reviewerId !== context.actor.userId)
    throw new ORPCError("NOT_FOUND");
  const assignment = await learnerReviewed(context, review.assignmentId);
  await requireOpenYear(context, assignment.schoolYearId);
  if (assignment.peerReleasedAt)
    throw new ORPCError("CONFLICT", { message: "coursework.peer_released" });
  return { review, assignment };
}

/**
 * A student sends their review of a classmate's work: a level for each
 * criterion when the work has a rubric, and both prompts. They may change
 * it until the teacher releases the reviews.
 */
export const send = writeProcedure
  .input(peerReviewInputSchema)
  .handler(async ({ input, context }) => {
    const { review, assignment } = await ownReview(context, input.reviewId);
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

/**
 * A reviewer comments on a passage of the classmate's page they review,
 * anchored as a teacher's comment is; the author reads it with the review.
 */
export const comment = writeProcedure
  .input(peerCommentSchema)
  .handler(async ({ input, context }) => {
    const { review, assignment } = await ownReview(context, input.reviewId);
    const work = await workUnderReview(context, assignment, review);
    if (!work.content)
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.peer_no_passage",
      });
    return insertPeerComment(context.tx, {
      tenantId: context.tenantId,
      reviewId: review.id,
      anchor: input.anchor,
      body: input.body,
    });
  });

/** A reviewer takes back one of their passage comments before the release. */
export const uncomment = writeProcedure
  .input(removePeerCommentSchema)
  .handler(async ({ input, context }) => {
    const found = await peerCommentById(context.tx, context.tenantId, input.id);
    if (!found) throw new ORPCError("NOT_FOUND");
    await ownReview(context, found.reviewId);
    await removePeerComment(context.tx, {
      tenantId: context.tenantId,
      id: found.id,
    });
    return {};
  });

/**
 * The author says how helpful a classmate's review of their work was, once
 * it is theirs to read; the teacher reads it beside the review.
 */
export const rate = writeProcedure
  .input(ratePeerReviewSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "own-work:read");
    const review = await peerReviewById(
      context.tx,
      context.tenantId,
      input.reviewId,
    );
    if (
      !review ||
      review.authorId !== context.actor.userId ||
      review.sentAt === null ||
      review.hiddenAt !== null
    )
      throw new ORPCError("NOT_FOUND");
    const assignment = await learnerReviewed(context, review.assignmentId);
    if (!assignment.peerReleasedAt) throw new ORPCError("NOT_FOUND");
    await ratePeerReview(context.tx, {
      tenantId: context.tenantId,
      id: review.id,
      helpfulness: input.helpfulness,
    });
    return { helpfulness: input.helpfulness };
  });
