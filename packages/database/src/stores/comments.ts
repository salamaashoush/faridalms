import type { Anchor } from "@faridalms/domain/anchors";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { orgPath } from "./identity";
import { isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface DocumentCommentRow {
  id: string;
  version: number;
  authorId: string;
  authorNameEn: string | null;
  authorNameAr: string | null;
  body: string;
  mentionedUserIds: string[];
  createdAt: string;
  editedAt: string | null;
  /** Whether the viewer wrote it, and so may change or delete it. */
  own: boolean;
}

export interface DocumentThreadRow {
  id: string;
  version: number;
  part: string;
  anchor: Anchor;
  quote: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByNameEn: string | null;
  resolvedByNameAr: string | null;
  comments: DocumentCommentRow[];
}

/** A document's threads, oldest first, each with its comments in the order written. */
export async function threadsOfDocument(
  tx: Tx,
  input: { tenantId: string; documentId: string; viewerId: string },
): Promise<DocumentThreadRow[]> {
  const threads = await tx.execute<{
    id: string;
    version: number;
    part: string;
    anchor: Anchor;
    quote: string;
    created_at: string;
    resolved_at: string | null;
    resolved_by_en: string | null;
    resolved_by_ar: string | null;
  }>(sql`
    select t.id, t.version, t.part, t.anchor, t.quote,
      ${isoOf(sql`t.created_at`)} as created_at,
      case when t.resolved_at is null then null else ${isoOf(sql`t.resolved_at`)} end as resolved_at,
      r.full_name_en as resolved_by_en, r.full_name_ar as resolved_by_ar
    from core.document_threads t
    left join core.users r on r.tenant_id = t.tenant_id and r.id = t.resolved_by_user_id
    where t.tenant_id = ${input.tenantId}::uuid and t.document_id = ${input.documentId}::uuid
      and t.status = 'active'
    order by t.created_at, t.id`);
  if (threads.length === 0) return [];
  const comments = await tx.execute<{
    id: string;
    version: number;
    thread_id: string;
    author_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    body: string;
    mentioned_user_ids: string[];
    created_at: string;
    edited_at: string | null;
  }>(sql`
    select c.id, c.version, c.thread_id, c.author_user_id, u.full_name_en, u.full_name_ar,
      c.body, c.mentioned_user_ids, ${isoOf(sql`c.created_at`)} as created_at,
      case when c.edited_at is null then null else ${isoOf(sql`c.edited_at`)} end as edited_at
    from core.document_comments c
    join core.users u on u.tenant_id = c.tenant_id and u.id = c.author_user_id
    where c.tenant_id = ${input.tenantId}::uuid and c.status = 'active'
      and c.thread_id = any(${uuidArray(threads.map((row) => row.id))})
    order by c.created_at, c.id`);
  const byThread = new Map<string, DocumentCommentRow[]>();
  for (const row of comments)
    byThread.set(row.thread_id, [
      ...(byThread.get(row.thread_id) ?? []),
      {
        id: row.id,
        version: row.version,
        authorId: row.author_user_id,
        authorNameEn: row.full_name_en,
        authorNameAr: row.full_name_ar,
        body: row.body,
        mentionedUserIds: row.mentioned_user_ids,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        own: row.author_user_id === input.viewerId,
      },
    ]);
  return threads.map((row) => ({
    id: row.id,
    version: row.version,
    part: row.part,
    anchor: row.anchor,
    quote: row.quote,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedByNameEn: row.resolved_by_en,
    resolvedByNameAr: row.resolved_by_ar,
    comments: byThread.get(row.id) ?? [],
  }));
}

/** A thread with the document it is on, or null when there is none. */
export async function threadById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<{
  id: string;
  version: number;
  documentId: string;
  quote: string;
  resolved: boolean;
} | null> {
  const [row] = await tx.execute<{
    id: string;
    version: number;
    document_id: string;
    quote: string;
    resolved: boolean;
  }>(sql`
    select id, version, document_id, quote, resolved_at is not null as resolved
    from core.document_threads
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid and status = 'active'`);
  return row
    ? {
        id: row.id,
        version: row.version,
        documentId: row.document_id,
        quote: row.quote,
        resolved: row.resolved,
      }
    : null;
}

/** A comment with the thread and document it is in, or null when there is none. */
export async function documentCommentById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<{
  id: string;
  version: number;
  threadId: string;
  documentId: string;
  quote: string;
  authorId: string;
  mentionedUserIds: string[];
} | null> {
  const [row] = await tx.execute<{
    id: string;
    version: number;
    thread_id: string;
    document_id: string;
    quote: string;
    author_user_id: string;
    mentioned_user_ids: string[];
  }>(sql`
    select c.id, c.version, c.thread_id, t.document_id, t.quote, c.author_user_id, c.mentioned_user_ids
    from core.document_comments c
    join core.document_threads t on t.tenant_id = c.tenant_id and t.id = c.thread_id
      and t.status = 'active'
    where c.tenant_id = ${tenantId}::uuid and c.id = ${id}::uuid and c.status = 'active'`);
  return row
    ? {
        id: row.id,
        version: row.version,
        threadId: row.thread_id,
        documentId: row.document_id,
        quote: row.quote,
        authorId: row.author_user_id,
        mentionedUserIds: row.mentioned_user_ids,
      }
    : null;
}

/** The record a document belongs to, while both are kept. */
export async function hostOfDocument(
  tx: Tx,
  tenantId: string,
  documentId: string,
): Promise<{ type: string; id: string } | null> {
  const [row] = await tx.execute<{ host_type: string; host_id: string }>(sql`
    select host_type, host_id from core.documents
    where tenant_id = ${tenantId}::uuid and id = ${documentId}::uuid and status = 'active'`);
  return row ? { type: row.host_type, id: row.host_id } : null;
}

/** The purpose a consent form belongs to, which its editor is opened through. */
export async function purposeOfNotice(
  tx: Tx,
  tenantId: string,
  noticeId: string,
): Promise<string | null> {
  const [row] = await tx.execute<{ id: string | null }>(sql`
    select purpose_descriptor_id as id from core.privacy_notices
    where tenant_id = ${tenantId}::uuid and id = ${noticeId}::uuid`);
  return row?.id ?? null;
}

export async function insertThread(
  tx: Tx,
  input: {
    tenantId: string;
    documentId: string;
    part: string;
    anchor: Record<string, unknown>;
    quote: string;
    userId: string;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.document_threads (tenant_id, document_id, part, anchor, quote, author_user_id)
    values (${input.tenantId}::uuid, ${input.documentId}::uuid, ${input.part},
      ${input.anchor}::jsonb, ${input.quote}, ${input.userId}::uuid)
    returning id, version`);
  if (!row) throw new Error("thread was not saved");
  return row;
}

export async function insertDocumentComment(
  tx: Tx,
  input: {
    tenantId: string;
    threadId: string;
    userId: string;
    body: string;
    mentionedUserIds: readonly string[];
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.document_comments (tenant_id, thread_id, author_user_id, body, mentioned_user_ids)
    values (${input.tenantId}::uuid, ${input.threadId}::uuid, ${input.userId}::uuid,
      ${input.body}, ${uuidArray(input.mentionedUserIds)})
    returning id, version`);
  if (!row) throw new Error("comment was not saved");
  return row;
}

/** Null when someone changed or removed the comment since it was read. */
export async function updateDocumentComment(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    body: string;
    mentionedUserIds: readonly string[];
  },
): Promise<{ id: string; version: number } | null> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    update core.document_comments set body = ${input.body},
      mentioned_user_ids = ${uuidArray(input.mentionedUserIds)}, edited_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning id, version`);
  return row ?? null;
}

/**
 * Removes a comment, and its thread with it once nothing is left in it.
 * False when someone changed or removed the comment since it was read.
 */
export async function removeDocumentComment(
  tx: Tx,
  input: { tenantId: string; id: string; expectedVersion: number },
): Promise<boolean> {
  const [row] = await tx.execute<{ thread_id: string }>(sql`
    update core.document_comments set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning thread_id`);
  if (!row) return false;
  await tx.execute(sql`
    update core.document_threads t set status = 'tobedeleted'
    where t.tenant_id = ${input.tenantId}::uuid and t.id = ${row.thread_id}::uuid
      and t.status = 'active'
      and not exists (select 1 from core.document_comments c
        where c.tenant_id = t.tenant_id and c.thread_id = t.id and c.status = 'active')`);
  return true;
}

/**
 * Resolves a thread as the given person, or reopens it with none. Null
 * when someone changed the thread since it was read.
 */
export async function setThreadResolved(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    userId: string | null;
  },
): Promise<{ id: string; version: number } | null> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    update core.document_threads set
      resolved_at = case when ${input.userId}::uuid is null then null else statement_timestamp() end,
      resolved_by_user_id = ${input.userId}::uuid
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning id, version`);
  return row ?? null;
}

/**
 * Those among `userIds` who hold a staff role today at the school or a
 * group above it, as the staff directory lists them.
 */
export async function staffAmong(
  tx: Tx,
  input: { tenantId: string; schoolId: string; today: string },
  userIds: readonly string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const path = await orgPath(tx, input.tenantId, input.schoolId);
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct r.user_id from core.user_roles r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.user_id and u.status = 'active'
    where r.tenant_id = ${input.tenantId}::uuid and r.org_id = any(${uuidArray(path)})
      and r.status = 'active' and r.valid_during @> ${input.today}::date
      and r.role = any(app.staff_roles()) and r.user_id = any(${uuidArray(userIds)})`);
  return rows.map((row) => row.user_id);
}
