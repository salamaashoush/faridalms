import type { AssignmentRow } from "@faridalms/database/stores/coursework";
import type { PeerReviewRow } from "@faridalms/database/stores/peer-reviews";
import type { ContentDocument } from "@faridalms/domain/content";

import {
  assignmentById,
  attemptById,
  discussionPostsOf,
} from "@faridalms/database/stores/coursework";
import { documentOf } from "@faridalms/database/stores/documents";
import { filesOfHost } from "@faridalms/database/stores/files";
import { reviewsOfSubmission } from "@faridalms/database/stores/peer-reviews";
import { quizAnswersOf } from "@faridalms/database/stores/quizzes";
import { withBlockIds } from "@faridalms/domain/content";
import {
  checkBlocks,
  isTeacherMarked,
  responseSchema,
} from "@faridalms/domain/learning";
import * as v from "valibot";

import type { UnitContext } from "./context";

import { attemptQuizzes, publishedQuiz } from "../quizzes/quiz";
import { can } from "./procedure";

/**
 * What a reviewer reads of a classmate's work: the page and files they
 * handed in, a quiz's answers only a teacher can mark, typed, spoken,
 * filmed, drawn or photographed, or what they posted in a discussion,
 * hidden posts left out.
 */
export async function workUnderReview(
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
    answers: [] as {
      blockId: string;
      prompt: string;
      text: string;
      recording: { fileId: string; video: boolean } | null;
      picture: { fileId: string } | null;
    }[],
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
          const read = v.safeParse(responseSchema, response);
          const written =
            read.success && read.output.type === "written" ? read.output : null;
          return {
            blockId: block.id,
            prompt: block.prompt,
            text: typeof response?.text === "string" ? response.text : "",
            recording: written?.recording
              ? {
                  fileId: written.recording.fileId,
                  video: Boolean(written.recording.video),
                }
              : null,
            picture: written?.picture
              ? { fileId: written.picture.fileId }
              : null,
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
 * Whether a student reads a file kept with a classmate's submission because
 * they review it: a recording or picture answering one of the questions a
 * quiz's review shows them, for as long as the review is theirs. No other
 * file of the submission opens to them.
 */
export async function reviewerReads(
  context: UnitContext,
  submissionId: string,
  fileId: string,
): Promise<boolean> {
  if (!can(context, "own-work:submit")) return false;
  const reviews = await reviewsOfSubmission(context.tx, {
    tenantId: context.tenantId,
    reviewerId: context.actor.userId,
    submissionId,
  });
  for (const review of reviews) {
    const assignment = await assignmentById(
      context.tx,
      context.tenantId,
      review.assignmentId,
    );
    if (assignment?.submissionFormat !== "quiz") continue;
    const work = await workUnderReview(context, assignment, review);
    if (
      work.answers.some(
        (answer) =>
          answer.recording?.fileId === fileId ||
          answer.picture?.fileId === fileId,
      )
    )
      return true;
  }
  return false;
}
