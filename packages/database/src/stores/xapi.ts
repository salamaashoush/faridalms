import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface RecordStoreRow {
  id: string;
  version: number;
  endpoint: string;
  username: string;
  sealedSecret: string | null;
  enabled: boolean;
}

type RecordStoreRecord = {
  id: string;
  version: number;
  endpoint: string;
  username: string;
  sealed_secret: string | null;
  enabled: boolean;
};

const storeOf = (row: RecordStoreRecord): RecordStoreRow => ({
  id: row.id,
  version: row.version,
  endpoint: row.endpoint,
  username: row.username,
  sealedSecret: row.sealed_secret,
  enabled: row.enabled,
});

/** A school's record store, set or not. */
export async function recordStoreOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<RecordStoreRow | null> {
  const [row] = await tx.execute<RecordStoreRecord>(sql`
    select id, version, endpoint, username, sealed_secret, enabled from core.xapi_stores
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'`);
  return row ? storeOf(row) : null;
}

/**
 * Sets a school's record store, or changes it from the version read; a
 * secret left out keeps the one kept. Null when it changed meanwhile.
 */
export async function saveRecordStore(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    expectedVersion: number;
    endpoint: string;
    username: string;
    sealedSecret?: string;
    enabled: boolean;
  },
): Promise<{ id: string; version: number } | null> {
  const secret = input.sealedSecret ?? null;
  if (input.expectedVersion === 0) {
    const [made] = await tx.execute<{ id: string; version: number }>(sql`
      insert into core.xapi_stores (tenant_id, org_id, endpoint, username, sealed_secret, enabled)
      values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.endpoint}, ${input.username},
        ${secret}, ${input.enabled})
      on conflict (tenant_id, org_id) where status = 'active' do nothing
      returning id, version`);
    return made ?? null;
  }
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    update core.xapi_stores
    set endpoint = ${input.endpoint}, username = ${input.username},
        sealed_secret = coalesce(${secret}, sealed_secret), enabled = ${input.enabled}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active' and version = ${input.expectedVersion}
    returning id, version`);
  return row ?? null;
}

/** Whether a school sends its learning to a record store now. */
export async function sendsStatements(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ sends: boolean }>(sql`
    select exists (select 1 from core.xapi_stores
      where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
        and status = 'active' and enabled) as sends`);
  return row?.sends ?? false;
}

export interface QueuedStatement {
  statementId: string;
  studentUserId: string;
  statement: Record<string, unknown>;
}

/** Queues statements for the school's record store; one already queued by its id stays as it is. */
export async function queueStatements(
  tx: Tx,
  input: { tenantId: string; orgId: string; statements: QueuedStatement[] },
): Promise<number> {
  if (input.statements.length === 0) return 0;
  const rows = await tx.execute(sql`
    insert into core.xapi_statements (tenant_id, org_id, statement_id, student_user_id, statement)
    select ${input.tenantId}::uuid, ${input.orgId}::uuid, s.statement_id, s.student_user_id,
      s.statement
    from jsonb_to_recordset(${JSON.stringify(
      input.statements.map((row) => ({
        statement_id: row.statementId,
        student_user_id: row.studentUserId,
        statement: row.statement,
      })),
    )}::text::jsonb) as s(statement_id uuid, student_user_id uuid, statement jsonb)
    on conflict (tenant_id, org_id, statement_id) where status = 'active' do nothing
    returning 1`);
  return rows.length;
}

export interface ClaimedStatement {
  id: string;
  orgId: string;
  statementId: string;
  statement: Record<string, unknown>;
  attempts: number;
}

/**
 * Takes the statements due to go, oldest first, for a while: those queued
 * and due, and those whose sender stopped before settling them. Taken, a
 * statement counts one more attempt.
 */
export async function claimStatements(
  tx: Tx,
  input: { tenantId: string; limit: number; leaseSeconds: number },
): Promise<ClaimedStatement[]> {
  const rows = await tx.execute<{
    id: string;
    org_id: string;
    statement_id: string;
    statement: Record<string, unknown>;
    attempts: number;
  }>(sql`
    with next as (
      select s.id from core.xapi_statements s
      where s.tenant_id = ${input.tenantId}::uuid and s.status = 'active'
        and ((s.state = 'queued' and s.due_at <= statement_timestamp())
          or (s.state = 'sending' and s.leased_until < statement_timestamp()))
      order by s.due_at, s.id
      limit ${input.limit}
      for update of s skip locked)
    update core.xapi_statements s
    set state = 'sending', attempts = least(s.attempts + 1, 20),
        leased_until = statement_timestamp() + make_interval(secs => ${input.leaseSeconds})
    from next
    where s.tenant_id = ${input.tenantId}::uuid and s.id = next.id
    returning s.id, s.org_id, s.statement_id, s.statement, s.attempts`);
  return rows.map((row) => ({
    id: row.id,
    orgId: row.org_id,
    statementId: row.statement_id,
    statement: row.statement,
    attempts: row.attempts,
  }));
}

/**
 * Settles statements the sender took: those the store took are kept as
 * sent without their body, those to try again wait until their time, and
 * those that cannot go stay failed with the reason.
 */
export async function settleStatements(
  tx: Tx,
  input: {
    tenantId: string;
    sent: string[];
    retry: { id: string; error: string; dueAt: Date }[];
    failed: { id: string; error: string }[];
  },
): Promise<void> {
  const t = input.tenantId;
  if (input.sent.length > 0)
    await tx.execute(sql`
      update core.xapi_statements
      set state = 'sent', sent_at = statement_timestamp(), leased_until = null,
          statement = null, error = null
      where tenant_id = ${t}::uuid and id = any(${uuidArray(input.sent)})
        and state = 'sending'`);
  for (const row of input.retry)
    await tx.execute(sql`
      update core.xapi_statements
      set state = 'queued', leased_until = null, error = ${row.error.slice(0, 500)},
          due_at = ${row.dueAt.toISOString()}::timestamptz
      where tenant_id = ${t}::uuid and id = ${row.id}::uuid and state = 'sending'`);
  for (const row of input.failed)
    await tx.execute(sql`
      update core.xapi_statements
      set state = 'failed', leased_until = null, error = ${row.error.slice(0, 500)}
      where tenant_id = ${t}::uuid and id = ${row.id}::uuid and state = 'sending'`);
}

/** What a school's sending stands at: how many wait, went and failed, and the last word from the store. */
export async function sendingOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<{
  queued: number;
  sent: number;
  failed: number;
  lastSentAt: Date | null;
  lastError: string | null;
}> {
  const [row] = await tx.execute<{
    queued: number;
    sent: number;
    failed: number;
    last_sent_at: Date | string | null;
    last_error: string | null;
  }>(sql`
    select count(*) filter (where state in ('queued', 'sending'))::int as queued,
           count(*) filter (where state = 'sent')::int as sent,
           count(*) filter (where state = 'failed')::int as failed,
           max(sent_at) as last_sent_at,
           (select error from core.xapi_statements e
             where e.tenant_id = ${input.tenantId}::uuid and e.org_id = ${input.orgId}::uuid
               and e.status = 'active' and e.error is not null
             order by e.date_last_modified desc limit 1) as last_error
    from core.xapi_statements
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'`);
  return {
    queued: row?.queued ?? 0,
    sent: row?.sent ?? 0,
    failed: row?.failed ?? 0,
    lastSentAt: row?.last_sent_at ? new Date(row.last_sent_at) : null,
    lastError: row?.last_error ?? null,
  };
}

/** Puts a school's failed statements back in the queue, to go at once. */
export async function retryFailed(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<number> {
  const rows = await tx.execute(sql`
    update core.xapi_statements
    set state = 'queued', attempts = 0, due_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active' and state = 'failed'
    returning 1`);
  return rows.length;
}

/**
 * Deletes, as retention, statements the school's store took before a day,
 * a batch at a time; the table's policy refuses any sent more lately than
 * its window.
 */
export async function purgeSentStatements(
  tx: Tx,
  input: { tenantId: string; sentBefore: Date; limit: number },
): Promise<number> {
  const rows = await tx.execute(sql`
    delete from core.xapi_statements
    where tenant_id = ${input.tenantId}::uuid and id in (
      select id from core.xapi_statements
      where tenant_id = ${input.tenantId}::uuid and state = 'sent'
        and sent_at < ${input.sentBefore.toISOString()}::timestamptz
      order by sent_at
      limit ${input.limit})
    returning 1`);
  return rows.length;
}
