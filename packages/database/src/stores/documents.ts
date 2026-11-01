import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { DocumentKind } from "../tables/documents";

import { isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface HostedDocument {
  id: string;
  version: number;
  locale: "ar" | "en" | null;
  content: Record<string, unknown>;
  plainText: string;
  frozenAt: string | null;
}

export interface Host {
  type: string;
  id: string;
}

export async function documentOf(
  tx: Tx,
  tenantId: string,
  host: Host,
): Promise<HostedDocument | null> {
  const [row] = await tx.execute<{
    id: string;
    version: number;
    locale: "ar" | "en" | null;
    content: Record<string, unknown>;
    plain_text: string;
    frozen_at: string | null;
  }>(sql`
    select id, version, locale, content, plain_text, frozen_at::text as frozen_at from core.documents
    where tenant_id = ${tenantId}::uuid and host_type = ${host.type} and host_id = ${host.id}::uuid
      and status = 'active' and translation_of_id is null
    order by created_at desc limit 1`);
  return row
    ? {
        id: row.id,
        version: row.version,
        locale: row.locale,
        content: row.content,
        plainText: row.plain_text,
        frozenAt: row.frozen_at,
      }
    : null;
}

export async function documentIdOf(
  tx: Tx,
  tenantId: string,
  host: Host,
): Promise<{ id: string; version: number } | null> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    select id, version from core.documents
    where tenant_id = ${tenantId}::uuid and host_type = ${host.type} and host_id = ${host.id}::uuid
      and status = 'active' and translation_of_id is null
    order by created_at desc limit 1`);
  return row ?? null;
}

/**
 * A record's document and its translation, original first, each with the
 * language it is written in and the kind of content it holds.
 */
export async function documentsInLanguages(
  tx: Tx,
  tenantId: string,
  host: Host,
): Promise<{ id: string; locale: "ar" | "en" | null; kind: DocumentKind }[]> {
  const original = await documentIdOf(tx, tenantId, host);
  if (!original) return [];
  return tx.execute<{
    id: string;
    locale: "ar" | "en" | null;
    kind: DocumentKind;
  }>(sql`
    select id, locale, kind from core.documents
    where tenant_id = ${tenantId}::uuid and status = 'active'
      and (id = ${original.id}::uuid or translation_of_id = ${original.id}::uuid)
    order by translation_of_id nulls first, created_at desc`);
}

/** The working content of several records' documents of one kind, by host. */
export async function contentsOf(
  tx: Tx,
  tenantId: string,
  hostType: string,
  hostIds: readonly string[],
): Promise<Map<string, Record<string, unknown>>> {
  if (hostIds.length === 0) return new Map();
  const rows = await tx.execute<{
    host_id: string;
    content: Record<string, unknown>;
  }>(sql`
    select distinct on (host_id) host_id, content from core.documents
    where tenant_id = ${tenantId}::uuid and host_type = ${hostType}
      and host_id = any(${uuidArray(hostIds)}) and status = 'active'
      and translation_of_id is null
    order by host_id, created_at desc`);
  return new Map(rows.map((row) => [row.host_id, row.content]));
}

/**
 * Of several records' documents of one kind, by host, only the blocks of the
 * given types at the top of each, under a root of their own: what a list
 * needs of a lesson's questions without reading every word. Content kept
 * from before documents had a root comes back whole.
 */
export async function topBlocksOf(
  tx: Tx,
  tenantId: string,
  hostType: string,
  hostIds: readonly string[],
  types: readonly string[],
): Promise<Map<string, Record<string, unknown>>> {
  if (hostIds.length === 0) return new Map();
  const rows = await tx.execute<{
    host_id: string;
    content: Record<string, unknown>;
  }>(sql`
    select distinct on (host_id) host_id,
      case when content ? 'root' then jsonb_build_object('root', jsonb_build_object(
        'type', 'root', 'version', 1, 'children', jsonb_path_query_array(content,
          'strict $.root.children[*] ? (@.type == $types[*])',
          jsonb_build_object('types', ${textArray(types)}))))
      else content end as content
    from core.documents
    where tenant_id = ${tenantId}::uuid and host_type = ${hostType}
      and host_id = any(${uuidArray(hostIds)}) and status = 'active'
      and translation_of_id is null
    order by host_id, created_at desc`);
  return new Map(rows.map((row) => [row.host_id, row.content]));
}

/** The files the last published copy of a document shows, which its readers still open. */
async function publishedFileIds(
  tx: Tx,
  tenantId: string,
  documentId: string,
): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    select distinct ref #>> '{}' as id
    from (
      select content from core.document_versions
      where tenant_id = ${tenantId}::uuid and document_id = ${documentId}::uuid
        and reason = 'publish' and redacted_at is null
      order by created_at desc, document_version desc limit 1) v,
      lateral jsonb_path_query(v.content,
        'lax $.**.fileId ? (@ like_regex "^[0-9a-f-]{36}$")') ref`);
  return rows.map((row) => row.id);
}

/**
 * Records the media a document embeds, and marks those files linked so the
 * sweep keeps them and its readers may open them. Files the document no
 * longer embeds lose their row, unless its published copy still shows them.
 */
async function syncMedia(
  tx: Tx,
  input: { tenantId: string; documentId: string; fileIds: readonly string[] },
) {
  const fileIds = [
    ...new Set([
      ...input.fileIds,
      ...(await publishedFileIds(tx, input.tenantId, input.documentId)),
    ]),
  ];
  input = { ...input, fileIds };
  await tx.execute(sql`
    update core.document_files set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and document_id = ${input.documentId}::uuid
      and status = 'active' and not (file_id = any(${uuidArray(input.fileIds)}))`);
  if (input.fileIds.length === 0) return;
  await tx.execute(sql`
    insert into core.document_files (tenant_id, document_id, file_id, file_purpose)
    select f.tenant_id, ${input.documentId}::uuid, f.id, f.purpose from core.files f
    where f.tenant_id = ${input.tenantId}::uuid and f.id = any(${uuidArray(input.fileIds)})
      and f.status = 'active' and f.state = 'ready' and f.purpose in ('document_media', 'attachment')
      and not exists (
        select 1 from core.document_files d
        where d.tenant_id = f.tenant_id and d.document_id = ${input.documentId}::uuid
          and d.file_id = f.id and d.status = 'active')`);
  await tx.execute(sql`
    update core.files set linked_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(input.fileIds)})
      and linked_at is null and state = 'ready' and purpose in ('document_media', 'attachment')`);
}

/** A save of the same words leaves the row, and so its revision, as it was. */
async function rewrite(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    content: Record<string, unknown>;
    plainText: string;
    locale: "ar" | "en" | null;
    userId: string | null;
  },
): Promise<{ id: string; version: number } | undefined> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    update core.documents d
    set content = n.content, plain_text = n.plain_text, locale = n.locale,
        last_edited_by_user_id = ${input.userId}::uuid, last_edited_at = statement_timestamp()
    from (select ${input.content}::jsonb as content, ${input.plainText}::text as plain_text,
            ${input.locale}::text as locale) n
    where d.tenant_id = ${input.tenantId}::uuid and d.id = ${input.id}::uuid
      and (d.content is distinct from n.content or d.plain_text is distinct from n.plain_text
           or d.locale is distinct from n.locale)
    returning d.id, d.version`);
  return row;
}

/**
 * Writes a host's document, creating it the first time. A document made
 * frozen, as a sent message's is, never changes afterwards.
 */
export async function saveDocument(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    host: Host;
    content: Record<string, unknown>;
    plainText: string;
    mediaIds: readonly string[];
    /** Who wrote it; null for words that arrived from outside, such as an email. */
    userId: string | null;
    kind?: DocumentKind;
    locale?: "en" | "ar" | null;
    frozen?: boolean;
  },
): Promise<{ id: string; version: number }> {
  const existing = await documentIdOf(tx, input.tenantId, input.host);
  const locale = input.locale ?? null;
  let saved: { id: string; version: number } | undefined;
  if (existing) {
    saved =
      (await rewrite(tx, {
        tenantId: input.tenantId,
        id: existing.id,
        content: input.content,
        plainText: input.plainText,
        locale,
        userId: input.userId,
      })) ?? existing;
  } else {
    [saved] = await tx.execute<{ id: string; version: number }>(sql`
      insert into core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version,
        locale, content, plain_text, frozen_at, last_edited_by_user_id, last_edited_at)
      values (${input.tenantId}::uuid, ${input.host.type}, ${input.host.id}::uuid,
        ${input.orgId}::uuid, ${input.kind ?? "rich_text"}, 1, ${locale}, ${input.content}::jsonb,
        ${input.plainText}, ${input.frozen ? sql`statement_timestamp()` : sql`null`},
        ${input.userId}::uuid, statement_timestamp())
      returning id, version`);
  }
  if (!saved) throw new Error("document was not saved");
  await syncMedia(tx, {
    tenantId: input.tenantId,
    documentId: saved.id,
    fileIds: input.mediaIds,
  });
  return saved;
}

/**
 * Copies a host's document onto another host, frozen: a handed-in attempt
 * keeps exactly what was sent even as the draft changes later.
 */
export async function freezeCopy(
  tx: Tx,
  input: { tenantId: string; from: Host; to: Host },
): Promise<string | null> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version,
      content, plain_text, frozen_at, last_edited_by_user_id, last_edited_at)
    select tenant_id, ${input.to.type}, ${input.to.id}::uuid, org_id, kind, schema_version,
      content, plain_text, statement_timestamp(), last_edited_by_user_id, last_edited_at
    from core.documents
    where tenant_id = ${input.tenantId}::uuid and host_type = ${input.from.type}
      and host_id = ${input.from.id}::uuid and status = 'active' and translation_of_id is null
    order by created_at desc limit 1
    returning id`);
  if (!row) return null;
  await tx.execute(sql`
    insert into core.document_files (tenant_id, document_id, file_id, file_purpose)
    select d.tenant_id, ${row.id}::uuid, d.file_id, d.file_purpose from core.document_files d
    join core.documents s on s.tenant_id = d.tenant_id and s.id = d.document_id
    where d.tenant_id = ${input.tenantId}::uuid and s.host_type = ${input.from.type}
      and s.host_id = ${input.from.id}::uuid and s.status = 'active' and d.status = 'active'`);
  return row.id;
}

/**
 * Writes a host's document frozen, as it was sent, from words made out of
 * another host's, such as a letter written from its template. The pictures
 * and files of the source are linked to it as they are.
 */
export async function insertFrozen(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    host: Host;
    from: Host;
    content: Record<string, unknown>;
    plainText: string;
    locale: "en" | "ar" | null;
    userId: string | null;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version, locale,
      content, plain_text, frozen_at, last_edited_by_user_id, last_edited_at)
    values (${input.tenantId}::uuid, ${input.host.type}, ${input.host.id}::uuid, ${input.orgId}::uuid,
      'rich_text', 1, ${input.locale}, ${input.content}::jsonb, ${input.plainText},
      statement_timestamp(), ${input.userId}::uuid, statement_timestamp())
    returning id`);
  if (!row) throw new Error("The document was not written");
  await tx.execute(sql`
    insert into core.document_files (tenant_id, document_id, file_id, file_purpose)
    select d.tenant_id, ${row.id}::uuid, d.file_id, d.file_purpose from core.document_files d
    join core.documents s on s.tenant_id = d.tenant_id and s.id = d.document_id
    where d.tenant_id = ${input.tenantId}::uuid and s.host_type = ${input.from.type}
      and s.host_id = ${input.from.id}::uuid and s.status = 'active' and d.status = 'active'`);
  return row.id;
}

type TranslationRecord = {
  id: string;
  version: number;
  locale: "ar" | "en" | null;
  content: Record<string, unknown>;
  plain_text: string;
  frozen_at: string | null;
};

export async function translationOf(
  tx: Tx,
  tenantId: string,
  originalId: string,
): Promise<HostedDocument | null> {
  const [row] = await tx.execute<TranslationRecord>(sql`
    select id, version, locale, content, plain_text, frozen_at::text as frozen_at from core.documents
    where tenant_id = ${tenantId}::uuid and translation_of_id = ${originalId}::uuid
      and status = 'active'
    order by created_at desc limit 1`);
  return row
    ? {
        id: row.id,
        version: row.version,
        locale: row.locale,
        content: row.content,
        plainText: row.plain_text,
        frozenAt: row.frozen_at,
      }
    : null;
}

async function translationIdOf(
  tx: Tx,
  tenantId: string,
  originalId: string,
): Promise<{ id: string; version: number } | null> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    select id, version from core.documents
    where tenant_id = ${tenantId}::uuid and translation_of_id = ${originalId}::uuid
      and status = 'active'
    order by created_at desc limit 1`);
  return row ?? null;
}

/** Writes the other language of a document, on the same host, creating it the first time. */
export async function saveTranslation(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    host: Host;
    originalId: string;
    locale: "en" | "ar";
    kind: DocumentKind;
    content: Record<string, unknown>;
    plainText: string;
    mediaIds: readonly string[];
    userId: string;
  },
): Promise<{ id: string; version: number }> {
  const existing = await translationIdOf(tx, input.tenantId, input.originalId);
  const saved = existing
    ? ((await rewrite(tx, {
        tenantId: input.tenantId,
        id: existing.id,
        content: input.content,
        plainText: input.plainText,
        locale: input.locale,
        userId: input.userId,
      })) ?? existing)
    : (
        await tx.execute<{ id: string; version: number }>(sql`
          insert into core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version,
            locale, translation_of_id, content, plain_text, last_edited_by_user_id, last_edited_at)
          values (${input.tenantId}::uuid, ${input.host.type}, ${input.host.id}::uuid,
            ${input.orgId}::uuid, ${input.kind}, 1, ${input.locale}, ${input.originalId}::uuid,
            ${input.content}::jsonb, ${input.plainText}, ${input.userId}::uuid, statement_timestamp())
          returning id, version`)
      )[0];
  if (!saved) throw new Error("translation was not saved");
  await syncMedia(tx, {
    tenantId: input.tenantId,
    documentId: saved.id,
    fileIds: input.mediaIds,
  });
  return saved;
}

/** The other language is no longer kept: its document and media go. */
export async function dropTranslation(
  tx: Tx,
  input: { tenantId: string; originalId: string },
): Promise<void> {
  const existing = await translationIdOf(tx, input.tenantId, input.originalId);
  if (!existing) return;
  await syncMedia(tx, {
    tenantId: input.tenantId,
    documentId: existing.id,
    fileIds: [],
  });
  await tx.execute(sql`
    update core.documents set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${existing.id}::uuid`);
}

/**
 * Snapshots a document as published. Publishing the same revision twice
 * keeps the one snapshot.
 */
export async function snapshotPublish(
  tx: Tx,
  input: { tenantId: string; documentId: string; userId: string },
): Promise<void> {
  await tx.execute(sql`
    insert into core.document_versions (tenant_id, document_id, document_version, reason,
      content, plain_text, created_by_user_id)
    select tenant_id, id, version, 'publish', content, plain_text, ${input.userId}::uuid
    from core.documents
    where tenant_id = ${input.tenantId}::uuid and id = ${input.documentId}::uuid and status = 'active'
    on conflict do nothing`);
}

export interface PublishedVersion {
  id: string;
  documentVersion: number;
  content: Record<string, unknown>;
  plainText: string;
}

/** The last published snapshot of a document, what its readers see. */
export async function publishedVersion(
  tx: Tx,
  tenantId: string,
  documentId: string,
): Promise<PublishedVersion | null> {
  const [row] = await tx.execute<{
    id: string;
    document_version: number;
    content: Record<string, unknown>;
    plain_text: string;
  }>(sql`
    select id, document_version, content, plain_text from core.document_versions
    where tenant_id = ${tenantId}::uuid and document_id = ${documentId}::uuid
      and reason = 'publish' and redacted_at is null
    order by created_at desc, document_version desc limit 1`);
  return row
    ? {
        id: row.id,
        documentVersion: row.document_version,
        content: row.content,
        plainText: row.plain_text,
      }
    : null;
}

/** One snapshot of a document, by its own id, as it was taken. */
export async function versionContent(
  tx: Tx,
  tenantId: string,
  versionId: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await tx.execute<{ content: Record<string, unknown> }>(sql`
    select content from core.document_versions
    where tenant_id = ${tenantId}::uuid and id = ${versionId}::uuid
      and redacted_at is null`);
  return row?.content ?? null;
}

export interface VersionRow {
  documentVersion: number;
  reason: "publish" | "checkpoint" | "before_restore" | "import";
  createdAt: string;
  createdByNameEn: string | null;
  createdByNameAr: string | null;
}

/** A document's snapshots, newest first. */
export async function versionsOf(
  tx: Tx,
  tenantId: string,
  documentId: string,
): Promise<VersionRow[]> {
  const rows = await tx.execute<{
    document_version: number;
    reason: VersionRow["reason"];
    created_at: string;
    name_en: string | null;
    name_ar: string | null;
  }>(sql`
    select v.document_version, v.reason, ${isoOf(sql`v.created_at`)} as created_at,
      u.full_name_en as name_en, u.full_name_ar as name_ar
    from core.document_versions v
    left join core.users u on u.tenant_id = v.tenant_id and u.id = v.created_by_user_id
    where v.tenant_id = ${tenantId}::uuid and v.document_id = ${documentId}::uuid
      and v.redacted_at is null
    order by v.created_at desc, v.document_version desc
    limit 100`);
  return rows.map((row) => ({
    documentVersion: row.document_version,
    reason: row.reason,
    createdAt: row.created_at,
    createdByNameEn: row.name_en,
    createdByNameAr: row.name_ar,
  }));
}

/**
 * Readies a restore: keeps the current content as a `before_restore`
 * snapshot and answers the earlier snapshot's content, which the caller
 * saves as a new revision through its host; history is never rewritten.
 * Null when there is no such snapshot.
 */
export async function contentToRestore(
  tx: Tx,
  input: {
    tenantId: string;
    documentId: string;
    documentVersion: number;
    userId: string;
  },
): Promise<Record<string, unknown> | null> {
  const [snapshot] = await tx.execute<{ content: Record<string, unknown> }>(sql`
    select content from core.document_versions
    where tenant_id = ${input.tenantId}::uuid and document_id = ${input.documentId}::uuid
      and document_version = ${input.documentVersion} and redacted_at is null
    order by created_at desc limit 1`);
  if (!snapshot) return null;
  await tx.execute(sql`
    insert into core.document_versions (tenant_id, document_id, document_version, reason,
      content, plain_text, created_by_user_id)
    select tenant_id, id, version, 'before_restore', content, plain_text, ${input.userId}::uuid
    from core.documents
    where tenant_id = ${input.tenantId}::uuid and id = ${input.documentId}::uuid and status = 'active'
    on conflict do nothing`);
  return snapshot.content;
}

/**
 * Opens a document to live editing. A frozen document never becomes
 * collaborative; the answer says whether this one is.
 */
export async function makeCollaborative(
  tx: Tx,
  input: { tenantId: string; documentId: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ collaborative: boolean }>(sql`
    update core.documents set collaborative = true
    where tenant_id = ${input.tenantId}::uuid and id = ${input.documentId}::uuid
      and status = 'active' and frozen_at is null and not collaborative
    returning collaborative`);
  if (row) return true;
  const [current] = await tx.execute<{ collaborative: boolean }>(sql`
    select collaborative from core.documents
    where tenant_id = ${input.tenantId}::uuid and id = ${input.documentId}::uuid
      and status = 'active'`);
  return current?.collaborative ?? false;
}
