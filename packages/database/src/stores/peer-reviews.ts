import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { isoOf } from "./sql";

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
});

const reviewColumns = sql`id, version, assignment_id, attempt_id, author_user_id, reviewer_user_id,
  rubric_scores, strengths, suggestion, ${isoOf(sql`sent_at`)} as sent_at,
  ${isoOf(sql`hidden_at`)} as hidden_at`;

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
