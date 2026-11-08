import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { PeerHelpfulness } from "../tables/coursework";

import { isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface PeerReviewRow {
  id: string;
  version: number;
  assignmentId: string;
  attemptId: string;
  authorId: string;
  reviewerId: string;
  rubricScores: Record<string, string>;
  strengths: string;
  suggestion: string;
  sentAt: string | null;
  hiddenAt: string | null;
  helpfulness: PeerHelpfulness | null;
}

type PeerReviewRecord = {
  id: string;
  version: number;
  assignment_id: string;
  attempt_id: string;
  author_user_id: string;
  reviewer_user_id: string;
  rubric_scores: Record<string, string>;
  strengths: string;
  suggestion: string;
  sent_at: string | null;
  hidden_at: string | null;
  helpfulness: PeerHelpfulness | null;
};

const reviewOf = (row: PeerReviewRecord): PeerReviewRow => ({
  id: row.id,
  version: row.version,
  assignmentId: row.assignment_id,
  attemptId: row.attempt_id,
  authorId: row.author_user_id,
  reviewerId: row.reviewer_user_id,
  rubricScores: row.rubric_scores,
  strengths: row.strengths,
  suggestion: row.suggestion,
  sentAt: row.sent_at,
  hiddenAt: row.hidden_at,
  helpfulness: row.helpfulness,
});

const reviewColumns = sql`id, version, assignment_id, attempt_id, author_user_id, reviewer_user_id,
  rubric_scores, strengths, suggestion, ${isoOf(sql`sent_at`)} as sent_at,
  ${isoOf(sql`hidden_at`)} as hidden_at, helpfulness`;

/**
 * An assignment's reviews in the order they were handed out, so each
 * reviewer's and each author's are numbered the same way every time.
 */
export async function peerReviewsOf(
  tx: Tx,
  input: { tenantId: string; assignmentId: string },
): Promise<PeerReviewRow[]> {
  const rows = await tx.execute<PeerReviewRecord>(sql`
    select ${reviewColumns} from core.peer_reviews
    where tenant_id = ${input.tenantId}::uuid and assignment_id = ${input.assignmentId}::uuid
      and status = 'active'
    order by created_at, id`);
  return rows.map(reviewOf);
}

export async function peerReviewById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<PeerReviewRow | null> {
  const [row] = await tx.execute<PeerReviewRecord>(sql`
    select ${reviewColumns} from core.peer_reviews
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid and status = 'active'`);
  return row ? reviewOf(row) : null;
}

/** Hands reviews out: each reviewer, whose work, as it was handed in. */
export async function insertPeerReviews(
  tx: Tx,
  input: {
    tenantId: string;
    assignmentId: string;
    reviews: readonly {
      reviewerId: string;
      authorId: string;
      attemptId: string;
    }[];
  },
): Promise<void> {
  if (input.reviews.length === 0) return;
  await tx.execute(sql`
    insert into core.peer_reviews (tenant_id, assignment_id, attempt_id, author_user_id,
      reviewer_user_id)
    values ${sql.join(
      input.reviews.map(
        (row) =>
          sql`(${input.tenantId}::uuid, ${input.assignmentId}::uuid, ${row.attemptId}::uuid,
            ${row.authorId}::uuid, ${row.reviewerId}::uuid)`,
      ),
      sql`, `,
    )}
    on conflict (tenant_id, assignment_id, reviewer_user_id, author_user_id)
      where status = 'active'
    do nothing`);
}

/**
 * Keeps what a reviewer wrote and marks it sent; sending again changes it
 * and keeps when it was first sent.
 */
export async function sendPeerReview(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    rubricScores: Record<string, string>;
    strengths: string;
    suggestion: string;
  },
): Promise<{ version: number } | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.peer_reviews
    set rubric_scores = ${JSON.stringify(input.rubricScores)}::text::jsonb,
        strengths = ${input.strengths}, suggestion = ${input.suggestion},
        sent_at = coalesce(sent_at, statement_timestamp())
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'
    returning version`);
  return row ?? null;
}

/** A teacher keeps a review from its author, or lets it through again. */
export async function hidePeerReview(
  tx: Tx,
  input: { tenantId: string; id: string; hiddenBy: string | null },
): Promise<void> {
  await tx.execute(sql`
    update core.peer_reviews
    set hidden_at = ${input.hiddenBy ? sql`statement_timestamp()` : sql`null`},
        hidden_by_user_id = ${input.hiddenBy}::uuid
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}

/** Marks when an assignment's reviews were first handed out, or released. */
export async function markPeerReview(
  tx: Tx,
  input: {
    tenantId: string;
    assignmentId: string;
    stage: "started" | "released";
  },
): Promise<void> {
  await tx.execute(sql`
    update core.assignments
    set ${
      input.stage === "started"
        ? sql`peer_started_at = coalesce(peer_started_at, statement_timestamp())`
        : sql`peer_released_at = coalesce(peer_released_at, statement_timestamp())`
    }
    where tenant_id = ${input.tenantId}::uuid and id = ${input.assignmentId}::uuid
      and status = 'active'`);
}

/** Whether the viewer was given this attempt to review. */
export async function reviewsAttempt(
  tx: Tx,
  input: { tenantId: string; attemptId: string; reviewerId: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ found: boolean }>(sql`
    select exists (
      select 1 from core.peer_reviews
      where tenant_id = ${input.tenantId}::uuid and attempt_id = ${input.attemptId}::uuid
        and reviewer_user_id = ${input.reviewerId}::uuid and status = 'active'
    ) as found`);
  return row?.found ?? false;
}

/** A reviewer's reviews of the attempts of one submission. */
export async function reviewsOfSubmission(
  tx: Tx,
  input: { tenantId: string; reviewerId: string; submissionId: string },
): Promise<PeerReviewRow[]> {
  const rows = await tx.execute<PeerReviewRecord>(sql`
    select ${reviewColumns} from core.peer_reviews r
    where r.tenant_id = ${input.tenantId}::uuid and r.status = 'active'
      and r.reviewer_user_id = ${input.reviewerId}::uuid
      and exists (select 1 from core.submission_attempts t
        where t.tenant_id = r.tenant_id and t.id = r.attempt_id
          and t.submission_id = ${input.submissionId}::uuid)
    order by r.created_at, r.id`);
  return rows.map(reviewOf);
}

/** Whether classmates were given this attempt to review. */
export async function attemptUnderReview(
  tx: Tx,
  tenantId: string,
  attemptId: string,
): Promise<boolean> {
  const [row] = await tx.execute<{ found: boolean }>(sql`
    select exists (
      select 1 from core.peer_reviews
      where tenant_id = ${tenantId}::uuid and attempt_id = ${attemptId}::uuid
        and status = 'active'
    ) as found`);
  return row?.found ?? false;
}

/** An author says how helpful a review of their work was, or changes it. */
export async function ratePeerReview(
  tx: Tx,
  input: { tenantId: string; id: string; helpfulness: PeerHelpfulness },
): Promise<void> {
  await tx.execute(sql`
    update core.peer_reviews set helpfulness = ${input.helpfulness}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}

export interface PeerCommentRow {
  id: string;
  reviewId: string;
  anchor: Record<string, unknown>;
  body: string;
  createdAt: string;
}

/** The passage comments of these reviews, in the order they were written. */
export async function peerCommentsOf(
  tx: Tx,
  input: { tenantId: string; reviewIds: readonly string[] },
): Promise<PeerCommentRow[]> {
  if (input.reviewIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    review_id: string;
    anchor: Record<string, unknown>;
    body: string;
    created_at: string;
  }>(sql`
    select id, review_id, anchor, body, ${isoOf(sql`created_at`)} as created_at
    from core.peer_review_comments
    where tenant_id = ${input.tenantId}::uuid and review_id = any(${uuidArray(input.reviewIds)})
      and status = 'active'
    order by created_at, id`);
  return rows.map((row) => ({
    id: row.id,
    reviewId: row.review_id,
    anchor: row.anchor,
    body: row.body,
    createdAt: row.created_at,
  }));
}

export async function insertPeerComment(
  tx: Tx,
  input: {
    tenantId: string;
    reviewId: string;
    anchor: Record<string, unknown>;
    body: string;
  },
): Promise<{ id: string }> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.peer_review_comments (tenant_id, review_id, anchor, body)
    values (${input.tenantId}::uuid, ${input.reviewId}::uuid,
      ${JSON.stringify(input.anchor)}::text::jsonb, ${input.body})
    returning id`);
  if (!row) throw new Error("the comment was not kept");
  return row;
}

export async function peerCommentById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<{ id: string; reviewId: string } | null> {
  const [row] = await tx.execute<{ id: string; review_id: string }>(sql`
    select id, review_id from core.peer_review_comments
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid and status = 'active'`);
  return row ? { id: row.id, reviewId: row.review_id } : null;
}

export async function removePeerComment(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    update core.peer_review_comments set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}

export interface DueReviewRow {
  id: string;
  orgId: string;
  title: string;
  peerDueAt: string;
  /** Those given work to review who have not yet sent every review. */
  reviewerIds: string[];
}

/**
 * Assignments whose reviews fall due within the hours given and whose
 * reviewers have not been reminded, claimed so two replicas never remind
 * twice.
 */
export async function peerReviewsDueSoon(
  tx: Tx,
  input: { tenantId: string; now: Date; withinHours: number; limit: number },
): Promise<DueReviewRow[]> {
  const now = input.now.toISOString();
  const rows = await tx.execute<{
    id: string;
    org_id: string;
    title: string;
    peer_due_at: string;
    reviewer_ids: string[] | null;
  }>(sql`
    select a.id, a.org_id, a.title, ${isoOf(sql`a.peer_due_at`)} as peer_due_at,
      (select array_agg(distinct r.reviewer_user_id) from core.peer_reviews r
        where r.tenant_id = a.tenant_id and r.assignment_id = a.id and r.status = 'active'
          and r.sent_at is null) as reviewer_ids
    from core.assignments a
    where a.tenant_id = ${input.tenantId}::uuid and a.status = 'active' and a.state = 'published'
      and a.peer_started_at is not null and a.peer_released_at is null
      and a.peer_reminded_at is null
      and a.peer_due_at > ${now}::timestamptz
      and a.peer_due_at <= ${now}::timestamptz + make_interval(hours => ${input.withinHours})
    order by a.peer_due_at
    limit ${input.limit}
    for update of a skip locked`);
  return rows.map((row) => ({
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    peerDueAt: row.peer_due_at,
    reviewerIds: row.reviewer_ids ?? [],
  }));
}

/** Marks an assignment's reviewers reminded of its review date. */
export async function markPeerReminded(
  tx: Tx,
  input: { tenantId: string; assignmentId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.assignments set peer_reminded_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and id = ${input.assignmentId}::uuid`);
}
