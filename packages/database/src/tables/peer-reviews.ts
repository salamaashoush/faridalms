import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  eraseAndDelete,
  erasureOf,
  fk,
  instant,
  pk,
  tenantColumns,
} from "./conventions";
import { assignments, submissionAttempts } from "./coursework";
import { users } from "./people";
import { tenants } from "./tenancy";

export type PeerHelpfulness = "very" | "somewhat" | "not";

/**
 * How classmates review each other's work on an assignment: how many
 * classmates' work each student reviews, whether reviewers and authors stay
 * unnamed to each other, when reviews are due, when they were handed out,
 * when the authors were let read them, and when reviewers still writing
 * were reminded of the date.
 */
export const peerReviewSettings = core.table.withRLS(
  "peer_review_settings",
  {
    ...tenantColumns(),
    assignmentId: uuid("assignment_id").notNull(),
    reviews: smallint("reviews").notNull(),
    anonymous: boolean("anonymous").notNull(),
    dueAt: instant("due_at"),
    startedAt: instant("started_at"),
    releasedAt: instant("released_at"),
    remindedAt: instant("reminded_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("peer_review_settings", t.tenantId, t.id),
    ...baseConstraints("peer_review_settings", t, tenants),
    fk(
      "peer_review_settings",
      [t.tenantId, t.assignmentId],
      [assignments.tenantId, assignments.id],
    ),
    ck("peer_review_settings", "reviews", sql`reviews between 1 and 5`),
    ck(
      "peer_review_settings",
      "stages",
      sql`(released_at is null or started_at is not null) and (reminded_at is null or due_at is not null)`,
    ),
    uniqueIndex("peer_review_settings_assignment_key")
      .on(t.tenantId, t.assignmentId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A student's review of a classmate's handed-in work, of the attempt it was
 * given to them on: levels on the work's rubric, when it has one, and what
 * works well and what would make it better. Its author reads it once the
 * teacher releases the reviews, unless the teacher hid it.
 */
export const peerReviews = core.table.withRLS(
  "peer_reviews",
  {
    ...tenantColumns(),
    assignmentId: uuid("assignment_id").notNull(),
    attemptId: uuid("attempt_id").notNull(),
    authorUserId: uuid("author_user_id").notNull(),
    reviewerUserId: uuid("reviewer_user_id").notNull(),
    rubricScores: jsonb("rubric_scores")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    strengths: text("strengths").notNull().default(""),
    suggestion: text("suggestion").notNull().default(""),
    sentAt: instant("sent_at"),
    hiddenAt: instant("hidden_at"),
    hiddenByUserId: uuid("hidden_by_user_id"),
    /** How helpful the work's author found it, once they read it. */
    helpfulness: text("helpfulness").$type<PeerHelpfulness>(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("peer_reviews", t.tenantId, t.id),
    ...baseConstraints("peer_reviews", t, tenants),
    fk(
      "peer_reviews",
      [t.tenantId, t.assignmentId],
      [assignments.tenantId, assignments.id],
    ),
    fk(
      "peer_reviews",
      [t.tenantId, t.attemptId],
      [submissionAttempts.tenantId, submissionAttempts.id],
    ),
    fk(
      "peer_reviews",
      [t.tenantId, t.authorUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "peer_reviews",
      [t.tenantId, t.reviewerUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "peer_reviews",
      [t.tenantId, t.hiddenByUserId],
      [users.tenantId, users.id],
    ),
    ck("peer_reviews", "self", sql`reviewer_user_id <> author_user_id`),
    ck(
      "peer_reviews",
      "rubric_scores",
      sql`jsonb_typeof(rubric_scores) = 'object' and octet_length(rubric_scores::text) <= 4096`,
    ),
    ck(
      "peer_reviews",
      "comments",
      sql`char_length(strengths) <= 2000 and char_length(suggestion) <= 2000`,
    ),
    ck(
      "peer_reviews",
      "sent",
      sql`sent_at is null or (strengths <> '' and suggestion <> '')`,
    ),
    ck(
      "peer_reviews",
      "hidden",
      sql`(hidden_at is null) = (hidden_by_user_id is null)`,
    ),
    ck(
      "peer_reviews",
      "helpfulness",
      sql`helpfulness is null or (helpfulness in ('very', 'somewhat', 'not') and sent_at is not null)`,
    ),
    uniqueIndex("peer_reviews_key")
      .on(t.tenantId, t.assignmentId, t.reviewerUserId, t.authorUserId)
      .where(sql`status = 'active'`),
    index("peer_reviews_assignment_idx")
      .on(t.tenantId, t.assignmentId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    // A review is both its writer's words and about its author's work.
    ...eraseAndDelete(
      sql`${erasureOf("reviewer_user_id")} or ${erasureOf("author_user_id")}`,
    ),
  ],
);

/**
 * A reviewer's comment on a passage of the classmate's work they review,
 * anchored to the frozen attempt as a teacher's is. It goes to the author
 * with the review, and with it when the review is erased.
 */
export const peerReviewComments = core.table.withRLS(
  "peer_review_comments",
  {
    ...tenantColumns(),
    reviewId: uuid("review_id").notNull(),
    anchor: jsonb("anchor").$type<Record<string, unknown>>().notNull(),
    body: text("body").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("peer_review_comments", t.tenantId, t.id),
    ...baseConstraints("peer_review_comments", t, tenants),
    fk(
      "peer_review_comments",
      [t.tenantId, t.reviewId],
      [peerReviews.tenantId, peerReviews.id],
    ),
    ck("peer_review_comments", "anchor", sql`jsonb_typeof(anchor) = 'object'`),
    ck(
      "peer_review_comments",
      "body",
      sql`char_length(body) between 1 and 2000`,
    ),
    index("peer_review_comments_review_idx")
      .on(t.tenantId, t.reviewId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(
      sql`exists (select 1 from core.peer_reviews r where r.tenant_id = peer_review_comments.tenant_id and r.id = peer_review_comments.review_id and (app.erasure_approved(r.tenant_id, r.reviewer_user_id) or app.erasure_approved(r.tenant_id, r.author_user_id)))`,
    ),
  ],
);
