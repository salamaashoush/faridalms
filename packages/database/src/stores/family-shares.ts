import type { Feed, Keyset } from "@faridalms/domain/paging";

import { feedOf } from "@faridalms/domain/paging";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

/** Of these attempts, those shared with the student's family. */
export async function sharedAmong(
  tx: Tx,
  input: { tenantId: string; attemptIds: readonly string[] },
): Promise<Set<string>> {
  if (input.attemptIds.length === 0) return new Set();
  const rows = await tx.execute<{ attempt_id: string }>(sql`
    select attempt_id from core.family_shares
    where tenant_id = ${input.tenantId}::uuid and attempt_id = any(${uuidArray(input.attemptIds)})
      and status = 'active'`);
  return new Set(rows.map((row) => row.attempt_id));
}

/** Shares handed-in work with each student's family; sharing twice keeps one. */
export async function shareAttempts(
  tx: Tx,
  input: {
    tenantId: string;
    shares: readonly { attemptId: string; studentId: string }[];
    userId: string;
  },
): Promise<void> {
  for (const share of input.shares)
    await tx.execute(sql`
      insert into core.family_shares (tenant_id, attempt_id, student_user_id, shared_by_user_id)
      values (${input.tenantId}::uuid, ${share.attemptId}::uuid, ${share.studentId}::uuid,
        ${input.userId}::uuid)
      on conflict (tenant_id, attempt_id) where status = 'active' do nothing`);
}

export async function unshareAttempts(
  tx: Tx,
  input: { tenantId: string; attemptIds: readonly string[] },
): Promise<void> {
  if (input.attemptIds.length === 0) return;
  await tx.execute(sql`
    update core.family_shares set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and attempt_id = any(${uuidArray(input.attemptIds)})
      and status = 'active'`);
}

export async function isShared(
  tx: Tx,
  tenantId: string,
  attemptId: string,
): Promise<boolean> {
  const [row] = await tx.execute<{ shared: boolean }>(sql`
    select exists (select 1 from core.family_shares where tenant_id = ${tenantId}::uuid
      and attempt_id = ${attemptId}::uuid and status = 'active') as shared`);
  return row?.shared ?? false;
}

export interface SharedPiece {
  attemptId: string;
  assignmentId: string;
  title: string;
  classCode: string;
  sharedAt: string;
}

/** The work a student's teachers have shared with their family, newest first. */
export async function sharedWorkOf(
  tx: Tx,
  input: {
    tenantId: string;
    studentId: string;
    limit: number;
    after: Keyset | null;
  },
): Promise<Feed<SharedPiece, Keyset>> {
  const after = input.after;
  const rows = await tx.execute<{
    id: string;
    attempt_id: string;
    assignment_id: string;
    title: string;
    class_code: string;
    shared_at: string;
  }>(sql`
    select h.id, h.attempt_id, a.id as assignment_id, a.title, c.code as class_code,
      ${isoOf(sql`h.created_at`)} as shared_at
    from core.family_shares h
    join core.submission_attempts t on t.tenant_id = h.tenant_id and t.id = h.attempt_id
      and t.status = 'active'
    join core.submissions s on s.tenant_id = t.tenant_id and s.id = t.submission_id
    join core.assignments a on a.tenant_id = s.tenant_id and a.id = s.assignment_id
      and a.status = 'active'
    join core.classes c on c.tenant_id = a.tenant_id and c.id = a.class_id
    where h.tenant_id = ${input.tenantId}::uuid and h.student_user_id = ${input.studentId}::uuid
      and h.status = 'active'
      and (${after === null}::boolean
        or (date_trunc('milliseconds', h.created_at), h.id)
          < (${after?.at ?? null}::timestamptz, ${after?.id ?? null}::uuid))
    order by date_trunc('milliseconds', h.created_at) desc, h.id desc
    limit ${input.limit + 1}`);
  const feed = feedOf(rows, input.limit, (row) => ({
    at: row.shared_at,
    id: row.id,
  }));
  return {
    rows: feed.rows.map((row) => ({
      attemptId: row.attempt_id,
      assignmentId: row.assignment_id,
      title: row.title,
      classCode: row.class_code,
      sharedAt: row.shared_at,
    })),
    next: feed.next,
  };
}
