import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { FilePurpose, FileState } from "../tables/files";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface StoredFile {
  id: string;
  purpose: FilePurpose;
  name: string;
  mediaType: string;
  sizeBytes: number;
  state: FileState;
  storageKey: string;
  uploadedByUserId: string | null;
  hostType: string | null;
  hostId: string | null;
}

type FileRecord = {
  id: string;
  purpose: FilePurpose;
  name: string;
  media_type: string;
  size_bytes: string | number;
  state: FileState;
  storage_key: string;
  uploaded_by_user_id: string | null;
  host_type: string | null;
  host_id: string | null;
};

const columns = sql`id, purpose, name, media_type, size_bytes, state, storage_key,
  uploaded_by_user_id, host_type, host_id`;

function fileOf(row: FileRecord): StoredFile {
  return {
    id: row.id,
    purpose: row.purpose,
    name: row.name,
    mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes),
    state: row.state,
    storageKey: row.storage_key,
    uploadedByUserId: row.uploaded_by_user_id,
    hostType: row.host_type,
    hostId: row.host_id,
  };
}

/** Where an object waits for its checks, and where it lives once ready. */
export const quarantineKey = (tenantId: string, fileId: string) =>
  `t/${tenantId}/q/${fileId}`;
export const readyKey = (tenantId: string, fileId: string) =>
  `t/${tenantId}/f/${fileId}`;

/** Records an upload the person is about to send; the key is the server's. */
export async function initiateFile(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    purpose: FilePurpose;
    name: string;
    mediaType: string;
    sizeBytes: number;
  },
): Promise<StoredFile> {
  const [{ id } = { id: null }] = await tx.execute<{ id: string }>(
    sql`select uuidv7() as id`,
  );
  if (!id) throw new Error("no id for the file");
  const [row] = await tx.execute<FileRecord>(sql`
    insert into core.files (tenant_id, id, uploaded_by_user_id, purpose, name, media_type,
      size_bytes, storage_key)
    values (${input.tenantId}::uuid, ${id}::uuid, ${input.userId}::uuid, ${input.purpose},
      ${input.name}, ${input.mediaType}, ${input.sizeBytes}, ${quarantineKey(input.tenantId, id)})
    returning ${columns}`);
  if (!row) throw new Error("file was not recorded");
  return fileOf(row);
}

export async function fileById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<StoredFile | null> {
  const [row] = await tx.execute<FileRecord>(sql`
    select ${columns} from core.files
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid and status = 'active'`);
  return row ? fileOf(row) : null;
}

export async function filesByIds(
  tx: Tx,
  tenantId: string,
  ids: readonly string[],
): Promise<StoredFile[]> {
  if (ids.length === 0) return [];
  const rows = await tx.execute<FileRecord>(sql`
    select ${columns} from core.files
    where tenant_id = ${tenantId}::uuid and id = any(${uuidArray(ids)}) and status = 'active'`);
  return rows.map(fileOf);
}

export async function filesOfHost(
  tx: Tx,
  tenantId: string,
  host: { type: string; id: string },
): Promise<StoredFile[]> {
  const rows = await tx.execute<FileRecord>(sql`
    select ${columns} from core.files
    where tenant_id = ${tenantId}::uuid and host_type = ${host.type} and host_id = ${host.id}::uuid
      and status = 'active' and state = 'ready'
    order by created_at, id`);
  return rows.map(fileOf);
}

/** The ready files of many hosts of one type, for a page of messages. */
export async function filesOfHosts(
  tx: Tx,
  tenantId: string,
  host: { type: string; ids: readonly string[] },
): Promise<(StoredFile & { hostId: string })[]> {
  if (host.ids.length === 0) return [];
  const rows = await tx.execute<FileRecord & { host_id: string }>(sql`
    select ${columns}, host_id from core.files
    where tenant_id = ${tenantId}::uuid and host_type = ${host.type}
      and host_id = any(${uuidArray(host.ids)}) and status = 'active' and state = 'ready'
    order by created_at, id`);
  return rows.map((row) => ({ ...fileOf(row), hostId: row.host_id }));
}

/**
 * Gives ready files a host. A file is linked once: another host's file, one
 * the actor did not upload, or one not yet verified is refused by returning
 * fewer ids than asked for.
 */
export async function linkFiles(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    ids: readonly string[];
    purpose: FilePurpose;
    host: { type: string; id: string };
  },
): Promise<string[]> {
  if (input.ids.length === 0) return [];
  const rows = await tx.execute<{ id: string }>(sql`
    update core.files
    set host_type = ${input.host.type}, host_id = ${input.host.id}::uuid,
        linked_at = coalesce(linked_at, statement_timestamp())
    where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(input.ids)})
      and status = 'active' and state = 'ready' and purpose = ${input.purpose}
      and ((host_id is null and uploaded_by_user_id = ${input.userId}::uuid)
        or (host_type = ${input.host.type} and host_id = ${input.host.id}::uuid))
    returning id`);
  return rows.map((row) => row.id);
}

/** Takes files off a host; they stay on record for the attempts that cite them. */
export async function unlinkFiles(
  tx: Tx,
  input: {
    tenantId: string;
    host: { type: string; id: string };
    keep: readonly string[];
  },
) {
  await tx.execute(sql`
    update core.files set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and host_type = ${input.host.type}
      and host_id = ${input.host.id}::uuid and status = 'active'
      and not (id = any(${uuidArray(input.keep)}))`);
}

/**
 * The verdict on an upload, written as the worker: a ready file moves to its
 * final key with its digest, a rejected one keeps its reason.
 */
export async function settleFile(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    verdict:
      | { state: "ready"; sha256: string; scanEngine: string | null }
      | {
          state: "rejected";
          reason:
            | "too_large"
            | "size_mismatch"
            | "content_mismatch"
            | "infected"
            | "scan_unavailable";
        };
  },
): Promise<boolean> {
  const verdict = input.verdict;
  const rows =
    verdict.state === "ready"
      ? await tx.execute<{ id: string }>(sql`
          update core.files
          set state = 'ready', sha256 = decode(${verdict.sha256}, 'hex'),
              storage_key = ${readyKey(input.tenantId, input.id)},
              scanned_at = case when ${verdict.scanEngine}::text is null then null else statement_timestamp() end,
              scan_engine = ${verdict.scanEngine}, ready_at = statement_timestamp()
          where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and state = 'initiated'
          returning id`)
      : await tx.execute<{ id: string }>(sql`
          update core.files set state = 'rejected', rejection_reason = ${verdict.reason}
          where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and state = 'initiated'
          returning id`);
  return rows.length > 0;
}

/**
 * Uploads started before `before` and never finished become rejected as
 * abandoned; their quarantine keys come back so the bytes can go too.
 */
export async function abandonUploads(
  tx: Tx,
  tenantId: string,
  before: Date,
  limit: number,
): Promise<string[]> {
  const rows = await tx.execute<{ storage_key: string }>(sql`
    update core.files set state = 'rejected', rejection_reason = 'abandoned'
    where tenant_id = ${tenantId}::uuid and id in (
      select id from core.files
      where tenant_id = ${tenantId}::uuid and state = 'initiated' and status = 'active'
        and created_at < ${before.toISOString()}::timestamptz
      order by created_at limit ${limit})
    returning storage_key`);
  return rows.map((row) => row.storage_key);
}

/**
 * Verified files nothing linked within their window are tombstoned. Their
 * keys come back only when no active row still points at the same object,
 * since a copy shares its source's bytes.
 */
export async function retireUnlinkedFiles(
  tx: Tx,
  tenantId: string,
  readyBefore: Date,
  limit: number,
): Promise<string[]> {
  const rows = await tx.execute<{ storage_key: string }>(sql`
    with retired as (
      update core.files set status = 'tobedeleted'
      where tenant_id = ${tenantId}::uuid and id in (
        select id from core.files
        where tenant_id = ${tenantId}::uuid and state = 'ready' and status = 'active'
          and linked_at is null and ready_at < ${readyBefore.toISOString()}::timestamptz
        order by ready_at limit ${limit})
      returning id, storage_key)
    select distinct r.storage_key from retired r
    where not exists (
      select 1 from core.files f
      where f.tenant_id = ${tenantId}::uuid and f.storage_key = r.storage_key
        and f.status = 'active' and f.id not in (select id from retired))`);
  return rows.map((row) => row.storage_key);
}

/**
 * Pictures and files no document has held for the whole trash window are
 * retired. A document's saved versions keep their links while they are
 * shown, so only media nothing reads any more goes. Keys come back only when
 * no active row still points at the same object.
 */
export async function retireTrashedMedia(
  tx: Tx,
  tenantId: string,
  removedBefore: Date,
  limit: number,
): Promise<string[]> {
  const before = removedBefore.toISOString();
  const rows = await tx.execute<{ storage_key: string }>(sql`
    with retired as (
      update core.files set status = 'tobedeleted'
      where tenant_id = ${tenantId}::uuid and id in (
        select f.id from core.files f
        where f.tenant_id = ${tenantId}::uuid and f.purpose = 'document_media'
          and f.status = 'active' and f.state = 'ready' and f.linked_at is not null
          and f.created_at < ${before}::timestamptz
          and not exists (
            select 1 from core.document_files l
            where l.tenant_id = f.tenant_id and l.file_id = f.id
              and (l.status = 'active' or l.date_last_modified >= ${before}::timestamptz))
        order by f.created_at limit ${limit})
      returning id, storage_key)
    select distinct r.storage_key from retired r
    where not exists (
      select 1 from core.files f
      where f.tenant_id = ${tenantId}::uuid and f.storage_key = r.storage_key
        and f.status = 'active' and f.id not in (select id from retired))`);
  return rows.map((row) => row.storage_key);
}

/** Moves a host's files onto another host, as handing in moves a draft's files onto its attempt. */
export async function rehostFiles(
  tx: Tx,
  input: {
    tenantId: string;
    from: { type: string; id: string };
    to: { type: string; id: string };
    /** Only these files, when given: those the frozen answer holds. */
    ids?: readonly string[];
  },
) {
  await tx.execute(sql`
    update core.files set host_type = ${input.to.type}, host_id = ${input.to.id}::uuid
    where tenant_id = ${input.tenantId}::uuid and host_type = ${input.from.type}
      and host_id = ${input.from.id}::uuid and status = 'active'
      and (${input.ids === undefined}::boolean or id = any(${uuidArray(input.ids ?? [])}))`);
}

/**
 * Gives the author's own new uploads, not yet part of anything, to the
 * record whose document they were put in. Returns the ids adopted.
 */
export async function adoptFiles(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    host: { type: string; id: string };
    ids: readonly string[];
  },
): Promise<string[]> {
  if (input.ids.length === 0) return [];
  const rows = await tx.execute<{ id: string }>(sql`
    update core.files
    set host_type = ${input.host.type}, host_id = ${input.host.id}::uuid,
      linked_at = coalesce(linked_at, statement_timestamp())
    where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(input.ids)})
      and host_type is null and uploaded_by_user_id = ${input.userId}::uuid
      and purpose in ('document_media', 'site_media') and state = 'ready' and status = 'active'
    returning id`);
  return rows.map((row) => row.id);
}

/**
 * The copy a record keeps of a file from somewhere else, made the first time
 * it is put in that record's document and reused after. The copy points at
 * the same verified object, so its facts are the source's; removing either
 * leaves the other, and the object goes only when no row points at it.
 */
export async function copyIntoHost(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    host: { type: string; id: string };
    sourceId: string;
  },
): Promise<string | null> {
  const [existing] = await tx.execute<{ id: string }>(sql`
    select id from core.files
    where tenant_id = ${input.tenantId}::uuid and host_type = ${input.host.type}
      and host_id = ${input.host.id}::uuid and status = 'active'
      and metadata->>'copiedFrom' = ${input.sourceId}
    limit 1`);
  if (existing) return existing.id;
  const [created] = await tx.execute<{ id: string }>(sql`
    insert into core.files (tenant_id, uploaded_by_user_id, purpose, name, media_type,
      size_bytes, sha256, state, storage_key, encryption, key_version, scanned_at,
      scan_engine, ready_at, linked_at, width, height, duration_ms, derivatives,
      host_type, host_id, metadata)
    select tenant_id, ${input.userId}::uuid, 'document_media', name, media_type,
      size_bytes, sha256, state, storage_key, encryption, key_version, scanned_at,
      scan_engine, ready_at, statement_timestamp(), width, height, duration_ms, derivatives,
      ${input.host.type}, ${input.host.id}::uuid,
      jsonb_build_object('copiedFrom', id::text)
    from core.files
    where tenant_id = ${input.tenantId}::uuid and id = ${input.sourceId}::uuid
      and status = 'active' and state = 'ready'
      and purpose in ('document_media', 'attachment', 'submission')
    returning id`);
  return created?.id ?? null;
}
