import * as v from "valibot";

import type { SubmissionFormat } from "./coursework";

import { anchorSchema } from "./anchors";

const id = v.pipe(v.string(), v.uuid());

/**
 * Peer review: students review classmates' handed-in work against the
 * work's rubric, when it has one, and with two prompts every time: what
 * works well, and what would make it better. It is formative: it helps
 * the work and the reviewer, and the teacher's mark stays the teacher's.
 */

/** One student reviewing one classmate's work. */
export interface Pairing {
  reviewerId: string;
  authorId: string;
}

const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [out[index], out[other]] = [out[other] as T, out[index] as T];
  }
  return out;
};

/**
 * Who reviews whom among the students whose work is in, as many reviews
 * each as asked and never their own. The first time, students stand in a
 * shuffled ring and each reviews the next ones along, so every student
 * gives and receives the same number. Work handed in later joins with the
 * fewest-loaded classmates on both sides, keeping the reviews even.
 */
export function allocateReviews(input: {
  existing: readonly Pairing[];
  students: readonly string[];
  reviews: number;
  random?: () => number;
}): Pairing[] {
  const random = input.random ?? Math.random;
  const students = [...new Set(input.students)];
  const each = Math.min(input.reviews, students.length - 1);
  if (each < 1) return [];
  const placed = new Set(
    input.existing.flatMap((pair) => [pair.reviewerId, pair.authorId]),
  );
  const newcomers = shuffled(
    students.filter((student) => !placed.has(student)),
    random,
  );
  if (input.existing.length === 0) {
    const ring = newcomers;
    return ring.flatMap((reviewerId, index) =>
      Array.from({ length: each }, (_, step) => ({
        reviewerId,
        authorId: ring[(index + step + 1) % ring.length] as string,
      })),
    );
  }
  const given = new Map(students.map((student) => [student, 0]));
  const received = new Map(students.map((student) => [student, 0]));
  const paired = new Set<string>();
  const pair = (reviewerId: string, authorId: string) => {
    paired.add(`${reviewerId}:${authorId}`);
    given.set(reviewerId, (given.get(reviewerId) ?? 0) + 1);
    received.set(authorId, (received.get(authorId) ?? 0) + 1);
  };
  for (const row of input.existing) pair(row.reviewerId, row.authorId);
  const added: Pairing[] = [];
  const fewest = (
    load: ReadonlyMap<string, number>,
    open: (student: string) => boolean,
  ) =>
    shuffled(students.filter(open), random)
      .toSorted((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))
      .slice(0, each);
  for (const student of newcomers) {
    for (const authorId of fewest(
      received,
      (other) => other !== student && !paired.has(`${student}:${other}`),
    )) {
      pair(student, authorId);
      added.push({ reviewerId: student, authorId });
    }
    for (const reviewerId of fewest(
      given,
      (other) => other !== student && !paired.has(`${other}:${student}`),
    )) {
      pair(reviewerId, student);
      added.push({ reviewerId, authorId: student });
    }
  }
  return added;
}

export const MAX_PEER_REVIEWS = 5;
export const MAX_PEER_COMMENT = 2000;
/**
 * The formats whose handed-in work classmates can read and review: written
 * work and files, a quiz's answers its teacher marks, and a discussion's
 * posts.
 */
export const PEER_FORMATS: readonly SubmissionFormat[] = [
  "online",
  "files",
  "both",
  "online_and_files",
  "quiz",
  "discussion",
];

/**
 * How peer review runs: how many classmates' work each student reviews,
 * and whether reviewer and author stay unnamed to each other, as they do
 * by default: anonymous reviewers give more critical feedback, and
 * students value it more (Panadero and Alqassab 2019).
 */
export const peerReviewSchema = v.object({
  reviews: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(MAX_PEER_REVIEWS),
  ),
  anonymous: v.boolean(),
  /** When the reviews are due; reviewers still writing are reminded the day before. */
  dueAt: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
    "",
  ),
});
export type PeerReviewSettings = v.InferOutput<typeof peerReviewSchema>;

/** What stops peer review being set as asked on work of this format and due date, or null. */
export function peerIssue(input: {
  settings: PeerReviewSettings;
  format: SubmissionFormat;
  workDueAt: string | null;
}): "coursework.peer_format" | "coursework.peer_due_early" | null {
  if (!PEER_FORMATS.includes(input.format)) return "coursework.peer_format";
  // Reviews follow the work they review.
  const reviewsDue = input.settings.dueAt
    ? Date.parse(input.settings.dueAt)
    : null;
  const workDue = input.workDueAt ? Date.parse(input.workDueAt) : null;
  if (reviewsDue !== null && workDue !== null && reviewsDue < workDue)
    return "coursework.peer_due_early";
  return null;
}

const peerComment = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(MAX_PEER_COMMENT),
);

/**
 * A student's review of a classmate's work: a level for each criterion of
 * the rubric, when the work has one, and the two prompts, what works well
 * and what would make it even better, both asked for every time.
 */
export const peerReviewInputSchema = v.object({
  reviewId: id,
  rubricScores: v.optional(
    v.record(
      v.pipe(v.string(), v.maxLength(40)),
      v.pipe(v.string(), v.maxLength(40)),
    ),
    {},
  ),
  strengths: peerComment,
  suggestion: peerComment,
});
export type PeerReviewInput = v.InferOutput<typeof peerReviewInputSchema>;

export const hidePeerReviewSchema = v.object({
  reviewId: id,
  hidden: v.boolean(),
});

/** How helpful an author found a classmate's review of their work. */
export const PEER_HELPFULNESS = ["very", "somewhat", "not"] as const;
export type PeerHelpfulness = (typeof PEER_HELPFULNESS)[number];

export const ratePeerReviewSchema = v.object({
  reviewId: id,
  helpfulness: v.picklist(PEER_HELPFULNESS),
});

/** A reviewer's comment on a passage of the work they review. */
export const peerCommentSchema = v.object({
  reviewId: id,
  anchor: anchorSchema,
  body: peerComment,
});

export const removePeerCommentSchema = v.object({ id });
