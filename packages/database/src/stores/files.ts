import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { FileDerivative, FilePurpose, FileState } from "../tables/files";

import { isoOf, uuidArray } from "./sql";

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
  trashedAt: string | null;
  /**
   * A recording whose maker cut its ends off, and the cut is still to be
   * made: until then it holds what was cut away.
   */
  uncut: boolean;
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
  trashed_at: string | null;
  uncut: boolean;
};

const columns = sql`id, purpose, name, media_type, size_bytes, state, storage_key,
  uploaded_by_user_id, host_type, host_id, ${isoOf(sql`trashed_at`)} as trashed_at,
  (metadata ? 'trim') as uncut`;

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
    trashedAt: row.trashed_at,
    uncut: row.uncut,
  };
}

/** Where an object waits for its checks, and where it lives once ready. */
export const quarantineKey = (tenantId: string, fileId: string) =>
  `t/${tenantId}/q/${fileId}`;
export const readyKey = (tenantId: string, fileId: string) =>
  `t/${tenantId}/f/${fileId}`;
/** Where the parts of an upload wait until the last one arrives. */
export const partsFolder = (tenantId: string, fileId: string) =>
  `t/${tenantId}/u/${fileId}`;
export const partKey = (tenantId: string, fileId: string, part: number) =>
  `${partsFolder(tenantId, fileId)}/${part}`;

/** Records an upload the person is about to send; the key is the server's. */
export async function initiateFile(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    /** The school the upload is made in. */
    orgId: string;
    purpose: FilePurpose;
    name: string;
    mediaType: string;
    sizeBytes: number;
    /** The part of a recording to keep, cut by the media service. */
    trim?: { startMs: number; endMs: number } | undefined;
  },
): Promise<StoredFile> {
  const [{ id } = { id: null }] = await tx.execute<{ id: string }>(
    sql`select uuidv7() as id`,
  );
  if (!id) throw new Error("no id for the file");
  const metadata = input.trim ? { trim: input.trim } : {};
  const [row] = await tx.execute<FileRecord>(sql`
    insert into core.files (tenant_id, id, uploaded_by_user_id, org_id, purpose, name,
      media_type, size_bytes, storage_key, metadata)
    values (${input.tenantId}::uuid, ${id}::uuid, ${input.userId}::uuid, ${input.orgId}::uuid,
      ${input.purpose}, ${input.name}, ${input.mediaType}, ${input.sizeBytes},
      ${quarantineKey(input.tenantId, id)}, ${metadata}::jsonb)
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
      | {
          state: "ready";
          sha256: string;
          scanEngine: string | null;
          /** Whether a video gets adaptive streams, which the media service makes. */
          stream: boolean;
        }
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
              scan_engine = ${verdict.scanEngine}, ready_at = statement_timestamp(),
              stream_state = case when ${verdict.stream} and media_type like 'video/%' then 'queued' end
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
 * Pictures and files a document dropped and no document has held for the
 * whole trash window are retired. A document's saved versions keep their links while they are
 * shown, so only media nothing reads any more goes. A class's or module's
 * file area is a library kept until a teacher deletes from it. Keys come back only when
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
          and f.host_type is distinct from 'class' and f.host_type is distinct from 'module'
          and f.created_at < ${before}::timestamptz
          -- Only what a document once held and has dropped: a file kept by
          -- a record of its own, as a declaration keeps its scan, stays.
          and exists (
            select 1 from core.document_files l
            where l.tenant_id = f.tenant_id and l.file_id = f.id)
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

/**
 * Retires the projects and stage pictures of coding answers saved over
 * since: all but a student's last `kept` saves of each question in each
 * attempt, once older than `savedBefore`. A file a kept save still holds
 * stays. Keys come back only when no active row still points at the same
 * object.
 */
export async function retireSupersededAnswers(
  tx: Tx,
  tenantId: string,
  input: { kept: number; savedBefore: Date; limit: number },
): Promise<string[]> {
  const rows = await tx.execute<{ storage_key: string }>(sql`
    with ranked as (
      select r.response, r.created_at,
        dense_rank() over (
          partition by r.lesson_id, r.student_user_id, r.block_id, r.attempt
          order by r.try desc) as recency
      from core.lesson_responses r
      where r.tenant_id = ${tenantId}::uuid and r.kind = 'scratch'
    ),
    held as (
      select (response->'project'->>'fileId')::uuid as file_id, recency, created_at from ranked
      union all
      select (response->'thumbnail'->>'fileId')::uuid, recency, created_at from ranked
      where response ? 'thumbnail'
    ),
    retired as (
      update core.files set status = 'tobedeleted'
      where tenant_id = ${tenantId}::uuid and id in (
        select f.id from core.files f
        where f.tenant_id = ${tenantId}::uuid and f.status = 'active'
          and f.host_type = 'lesson_answer'
          and f.id in (
            select file_id from held
            where recency > ${input.kept}
              and created_at < ${input.savedBefore.toISOString()}::timestamptz)
          and f.id not in (
            select file_id from held
            where file_id is not null and recency <= ${input.kept})
        order by f.created_at limit ${input.limit})
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
 * Moves files a document already held under its own record into the file
 * area that record belongs to, as a lesson's pictures join its module's.
 */
export async function moveIntoArea(
  tx: Tx,
  input: {
    tenantId: string;
    from: { type: string; id: string };
    area: { type: string; id: string };
    ids: readonly string[];
  },
) {
  if (input.ids.length === 0) return;
  await tx.execute(sql`
    update core.files set host_type = ${input.area.type}, host_id = ${input.area.id}::uuid
    where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(input.ids)})
      and host_type = ${input.from.type} and host_id = ${input.from.id}::uuid
      and status = 'active'`);
}

/** The records whose live documents show a file. */
export async function documentHostsOfFile(
  tx: Tx,
  tenantId: string,
  fileId: string,
): Promise<{ type: string; id: string }[]> {
  const rows = await tx.execute<{ host_type: string; host_id: string }>(sql`
    select distinct d.host_type, d.host_id from core.document_files l
    join core.documents d on d.tenant_id = l.tenant_id and d.id = l.document_id
      and d.status = 'active'
    where l.tenant_id = ${tenantId}::uuid and l.file_id = ${fileId}::uuid
      and l.status = 'active'
    limit 50`);
  return rows.map((row) => ({ type: row.host_type, id: row.host_id }));
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
    orgId: string;
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
    insert into core.files (tenant_id, uploaded_by_user_id, org_id, purpose, name, media_type,
      size_bytes, sha256, state, storage_key, encryption, key_version, scanned_at,
      scan_engine, ready_at, linked_at, width, height, duration_ms, derivatives,
      host_type, host_id, metadata)
    select tenant_id, ${input.userId}::uuid, ${input.orgId}::uuid, 'document_media', name, media_type,
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

export interface AreaFile {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedByUserId: string | null;
  trashedAt: string | null;
  /** Earlier files replaced here, kept for the trash window. */
  versions: number;
  /** The lessons and assignments whose documents show it. */
  usedIn: { hostType: string; hostId: string; title: string }[];
}

/** A class's or module's file area, or what of it waits in the trash. */
export async function areaFiles(
  tx: Tx,
  tenantId: string,
  area: { type: string; id: string },
  trashed: boolean,
): Promise<AreaFile[]> {
  const rows = await tx.execute<{
    id: string;
    name: string;
    media_type: string;
    size_bytes: string | number;
    created_at: string;
    uploaded_by_user_id: string | null;
    trashed_at: string | null;
    versions: string | number;
    used_in: AreaFile["usedIn"];
  }>(sql`
    select f.id, f.name, f.media_type, f.size_bytes, ${isoOf(sql`f.created_at`)} as created_at,
      f.uploaded_by_user_id, ${isoOf(sql`f.trashed_at`)} as trashed_at,
      (select count(*) from core.files v
        where v.tenant_id = f.tenant_id and v.host_type = 'file_version'
          and v.host_id = f.id and v.status = 'active') as versions,
      coalesce((
        select jsonb_agg(distinct jsonb_build_object(
          'hostType', d.host_type, 'hostId', d.host_id,
          'title', coalesce(a.title, l.title, '')))
        from core.document_files l2
        join core.documents d on d.tenant_id = l2.tenant_id and d.id = l2.document_id
          and d.status = 'active'
        left join core.assignments a on a.tenant_id = d.tenant_id and a.id = d.host_id
          and d.host_type in ('assignment', 'assignment_quiz')
        left join core.lessons l on l.tenant_id = d.tenant_id and l.id = d.host_id
          and d.host_type = 'lesson'
        where l2.tenant_id = f.tenant_id and l2.file_id = f.id and l2.status = 'active'
      ), '[]'::jsonb) as used_in
    from core.files f
    where f.tenant_id = ${tenantId}::uuid and f.host_type = ${area.type}
      and f.host_id = ${area.id}::uuid and f.status = 'active' and f.state = 'ready'
      and (f.trashed_at is not null) = ${trashed}
    order by coalesce(f.trashed_at, f.created_at) desc
    limit 1000`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
    uploadedByUserId: row.uploaded_by_user_id,
    trashedAt: row.trashed_at,
    versions: Number(row.versions),
    usedIn: row.used_in,
  }));
}

/** Renames a file in an area; false when it is not there. */
export async function renameAreaFile(
  tx: Tx,
  input: {
    tenantId: string;
    area: { type: string; id: string };
    id: string;
    name: string;
  },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.files set name = ${input.name}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and host_type = ${input.area.type} and host_id = ${input.area.id}::uuid
      and status = 'active'
    returning id`);
  return rows.length > 0;
}

/** Moves a file of an area into its trash, or back out; false when it is not there. */
export async function trashAreaFile(
  tx: Tx,
  input: {
    tenantId: string;
    area: { type: string; id: string };
    id: string;
    trashed: boolean;
  },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.files
    set trashed_at = case when ${input.trashed} then statement_timestamp() end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and host_type = ${input.area.type} and host_id = ${input.area.id}::uuid
      and status = 'active' and (trashed_at is null) = ${input.trashed}
    returning id`);
  return rows.length > 0;
}

/**
 * Files in the trash for the whole window are retired. Keys come back only
 * when no active row still points at the same object.
 */
export async function retireTrashedFiles(
  tx: Tx,
  tenantId: string,
  trashedBefore: Date,
  limit: number,
): Promise<string[]> {
  const rows = await tx.execute<{ storage_key: string }>(sql`
    with retired as (
      update core.files set status = 'tobedeleted'
      where tenant_id = ${tenantId}::uuid and id in (
        select id from core.files
        where tenant_id = ${tenantId}::uuid and status = 'active'
          and trashed_at < ${trashedBefore.toISOString()}::timestamptz
        order by trashed_at limit ${limit})
      returning id, storage_key)
    select distinct r.storage_key from retired r
    where not exists (
      select 1 from core.files f
      where f.tenant_id = ${tenantId}::uuid and f.storage_key = r.storage_key
        and f.status = 'active' and f.id not in (select id from retired))`);
  return rows.map((row) => row.storage_key);
}

/**
 * Puts another file's verified bytes under an existing file, so every
 * document showing it shows the new ones, and keeps the bytes it had as a
 * previous version in the trash for the sweep's window. The other file,
 * a new upload or a previous version being restored, is retired; its
 * object lives on under the file it went into. Run as the worker, the only
 * role that may change what a row points at.
 */
export async function replaceFileBytes(
  tx: Tx,
  input: {
    tenantId: string;
    targetId: string;
    sourceId: string;
    userId: string;
  },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    with target as (
      select * from core.files
      where tenant_id = ${input.tenantId}::uuid and id = ${input.targetId}::uuid
        and status = 'active' and state = 'ready'
      for update),
    source as (
      select * from core.files
      where tenant_id = ${input.tenantId}::uuid and id = ${input.sourceId}::uuid
        and status = 'active' and state = 'ready'),
    kept as (
      insert into core.files (tenant_id, uploaded_by_user_id, org_id, purpose, name, media_type,
        size_bytes, sha256, state, storage_key, encryption, key_version, scanned_at,
        scan_engine, ready_at, linked_at, width, height, duration_ms, derivatives,
        host_type, host_id, trashed_at, metadata)
      select t.tenant_id, t.uploaded_by_user_id, t.org_id, t.purpose, t.name, t.media_type,
        t.size_bytes, t.sha256, t.state, t.storage_key, t.encryption, t.key_version,
        t.scanned_at, t.scan_engine, t.ready_at, statement_timestamp(), t.width, t.height,
        t.duration_ms, t.derivatives, 'file_version', t.id, statement_timestamp(),
        jsonb_build_object('replacedBy', ${input.userId}::text)
      from target t, source
      returning id)
    update core.files f
    set name = s.name, media_type = s.media_type, size_bytes = s.size_bytes,
      sha256 = s.sha256, storage_key = s.storage_key, encryption = s.encryption,
      key_version = s.key_version, scanned_at = s.scanned_at, scan_engine = s.scan_engine,
      ready_at = s.ready_at, width = s.width, height = s.height,
      duration_ms = s.duration_ms, derivatives = s.derivatives
    from source s, kept
    where f.tenant_id = ${input.tenantId}::uuid and f.id = ${input.targetId}::uuid
    returning f.id`);
  if (rows.length === 0) return false;
  await tx.execute(sql`
    update core.files set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.sourceId}::uuid`);
  return true;
}

/** A file's previous versions, newest first, while the trash keeps them. */
export async function fileVersions(
  tx: Tx,
  tenantId: string,
  fileId: string,
): Promise<StoredFile[]> {
  const rows = await tx.execute<FileRecord>(sql`
    select ${columns} from core.files
    where tenant_id = ${tenantId}::uuid and host_type = 'file_version'
      and host_id = ${fileId}::uuid and status = 'active'
    order by trashed_at desc`);
  return rows.map(fileOf);
}

export interface StorageUse {
  usedBytes: number;
  fileCount: number;
}

/**
 * Storage counted once per stored object, since copies and versions share
 * bytes; uploads still arriving count by their declared size.
 */
const counted = (where: ReturnType<typeof sql>) => sql`
  select coalesce(sum(size_bytes), 0) as used_bytes, count(*) as file_count from (
    select distinct on (storage_key) size_bytes from core.files f
    where f.status = 'active' and f.state in ('initiated', 'quarantined', 'ready')
      and ${where}
    order by storage_key) objects`;

async function measure(
  tx: Tx,
  query: ReturnType<typeof sql>,
): Promise<StorageUse> {
  const [row] = await tx.execute<{
    used_bytes: string | number;
    file_count: string | number;
  }>(query);
  return {
    usedBytes: Number(row?.used_bytes ?? 0),
    fileCount: Number(row?.file_count ?? 0),
  };
}

/** Everything uploaded in a school, the pool its plan sets. */
export function schoolStorage(tx: Tx, tenantId: string, orgId: string) {
  return measure(
    tx,
    counted(sql`f.tenant_id = ${tenantId}::uuid and f.org_id = ${orgId}::uuid`),
  );
}

/** A class's or module's area, with the previous versions it keeps. */
export function areaStorage(
  tx: Tx,
  tenantId: string,
  area: { type: string; id: string },
) {
  return measure(
    tx,
    counted(sql`f.tenant_id = ${tenantId}::uuid and (
      (f.host_type = ${area.type} and f.host_id = ${area.id}::uuid)
      or (f.host_type = 'file_version' and f.host_id in (
        select a.id from core.files a
        where a.tenant_id = ${tenantId}::uuid and a.host_type = ${area.type}
          and a.host_id = ${area.id}::uuid and a.status = 'active')))`),
  );
}

/**
 * A person's own work: what they uploaded that sits outside class and
 * module areas, as answers, hand-ins, messages and uploads not yet placed.
 */
export function personStorage(tx: Tx, tenantId: string, userId: string) {
  return measure(
    tx,
    counted(sql`f.tenant_id = ${tenantId}::uuid and f.uploaded_by_user_id = ${userId}::uuid
      and (f.host_type is null
        or f.host_type in ('submission', 'submission_attempt', 'message'))`),
  );
}

/** The family's answer in force for a subject's photos shown one way, or null before any. */
const photoAnswer = (meaning: string, on: string) => sql`(
  select case when c.decision = 'granted' and c.valid_during @> ${on}::date then 'granted'
    else 'refused' end
  from core.current_consents c
  join core.descriptors d on d.tenant_id = c.tenant_id and d.id = c.purpose_descriptor_id
  where c.tenant_id = s.tenant_id and c.subject_user_id = s.user_id
    and d.system_meaning = ${meaning}
  order by c.created_at desc limit 1)`;

/** A person a photo shows, and whether their family agreed to each way of showing it. */
export interface FileSubject {
  fileId: string;
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  website: "granted" | "refused" | null;
  news: "granted" | "refused" | null;
}

export async function subjectsOf(
  tx: Tx,
  input: { tenantId: string; fileIds: readonly string[]; on: string },
): Promise<FileSubject[]> {
  if (input.fileIds.length === 0) return [];
  const rows = await tx.execute<{
    file_id: string;
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    website: "granted" | "refused" | null;
    news: "granted" | "refused" | null;
  }>(sql`
    select s.file_id, s.user_id, u.full_name_en, u.full_name_ar,
      ${photoAnswer("photo_website", input.on)} as website,
      ${photoAnswer("photo_internal", input.on)} as news
    from core.file_subjects s
    join core.users u on u.tenant_id = s.tenant_id and u.id = s.user_id
    where s.tenant_id = ${input.tenantId}::uuid and s.file_id = any(${uuidArray(input.fileIds)})
      and s.status = 'active'
    order by u.full_name_en, u.full_name_ar`);
  return rows.map((row) => ({
    fileId: row.file_id,
    userId: row.user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    website: row.website,
    news: row.news,
  }));
}

/** Records exactly these people as the ones a photo shows. */
export async function setSubjects(
  tx: Tx,
  input: {
    tenantId: string;
    fileId: string;
    userIds: readonly string[];
    taggedBy: string;
  },
): Promise<void> {
  await tx.execute(sql`
    update core.file_subjects set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and file_id = ${input.fileId}::uuid
      and status = 'active' and not (user_id = any(${uuidArray(input.userIds)}))`);
  if (input.userIds.length === 0) return;
  await tx.execute(sql`
    insert into core.file_subjects (tenant_id, file_id, user_id, tagged_by_user_id)
    select ${input.tenantId}::uuid, ${input.fileId}::uuid, u.id, ${input.taggedBy}::uuid
    from core.users u
    where u.tenant_id = ${input.tenantId}::uuid and u.id = any(${uuidArray(input.userIds)})
      and not exists (
        select 1 from core.file_subjects s
        where s.tenant_id = u.tenant_id and s.file_id = ${input.fileId}::uuid
          and s.user_id = u.id and s.status = 'active')`);
}

/** How many times a video is tried before it is left playing as one file. */
export const STREAM_ATTEMPTS = 3;

/** A video the media service is to encode, cut first when its maker cut it. */
export interface StreamJob {
  fileId: string;
  storageKey: string;
  trim: { startMs: number; endMs: number } | null;
}

/** What a recording's upload became once the media service cut it. */
export interface CutSource {
  sizeBytes: number;
  sha256: string;
}

/**
 * The oldest video waiting for streams, leased to the caller until `until`;
 * one whose lease ran out, its worker gone, is taken again.
 */
export async function claimStream(
  tx: Tx,
  input: { tenantId: string; now: Date; until: Date },
): Promise<StreamJob | null> {
  const [row] = await tx.execute<{
    id: string;
    storage_key: string;
    trim: StreamJob["trim"];
  }>(sql`
    with next as (
      select id from core.files
      where tenant_id = ${input.tenantId}::uuid and status = 'active' and state = 'ready'
        and stream_attempts < ${STREAM_ATTEMPTS}
        and (stream_state = 'queued'
          or (stream_state = 'encoding' and stream_leased_until < ${input.now.toISOString()}::timestamptz))
      order by ready_at
      limit 1
      for update skip locked
    )
    update core.files f
    set stream_state = 'encoding', stream_attempts = f.stream_attempts + 1,
        stream_leased_until = ${input.until.toISOString()}::timestamptz, stream_progress = 0
    from next where f.tenant_id = ${input.tenantId}::uuid and f.id = next.id
    returning f.id, f.storage_key, f.metadata -> 'trim' as trim`);
  return row
    ? { fileId: row.id, storageKey: row.storage_key, trim: row.trim }
    : null;
}

/** How far an encode has got, which also keeps its lease. */
export async function streamProgress(
  tx: Tx,
  input: { tenantId: string; fileId: string; progress: number; until: Date },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.files
    set stream_progress = ${Math.min(1, Math.max(0, input.progress))},
        stream_leased_until = ${input.until.toISOString()}::timestamptz
    where tenant_id = ${input.tenantId}::uuid and id = ${input.fileId}::uuid
      and stream_state = 'encoding'
    returning id`);
  return rows.length > 0;
}

/** A video's streams are ready: where they are, and the size and length the encode found. */
export async function streamReady(
  tx: Tx,
  input: {
    tenantId: string;
    fileId: string;
    width: number;
    height: number;
    durationMs: number;
    derivatives: Record<string, FileDerivative>;
    /** The cut that took the upload's place, an MP4 whatever was uploaded. */
    cut?: CutSource | undefined;
  },
): Promise<boolean> {
  const cut = input.cut ?? null;
  const rows = await tx.execute<{ id: string }>(sql`
    update core.files
    set stream_state = 'ready', stream_progress = 1, stream_leased_until = null, stream_error = null,
        width = ${input.width}, height = ${input.height}, duration_ms = ${input.durationMs},
        derivatives = derivatives || ${input.derivatives}::jsonb,
        size_bytes = coalesce(${cut?.sizeBytes ?? null}::bigint, size_bytes),
        sha256 = coalesce(decode(${cut?.sha256 ?? null}::text, 'hex'), sha256),
        media_type = case when ${cut !== null} then 'video/mp4' else media_type end,
        name = case when ${cut !== null}
          then regexp_replace(name, '\\.[A-Za-z0-9]+$', '') || '.mp4' else name end,
        metadata = case when ${cut !== null} then metadata - 'trim' else metadata end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.fileId}::uuid
      and stream_state = 'encoding'
      -- A recording to be cut is ready only once it has been.
      and (not (metadata ? 'trim') or ${cut !== null})
    returning id`);
  return rows.length > 0;
}

/** An encode failed: tried again later, or left after its last attempt. */
export async function streamFailed(
  tx: Tx,
  input: { tenantId: string; fileId: string; error: string },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.files
    set stream_state = case when stream_attempts >= ${STREAM_ATTEMPTS} then 'failed' else 'queued' end,
        stream_leased_until = null, stream_progress = null,
        stream_error = left(${input.error}, 2000)
    where tenant_id = ${input.tenantId}::uuid and id = ${input.fileId}::uuid
      and stream_state = 'encoding'
    returning id`);
  return rows.length > 0;
}

/**
 * The stream folders of videos that are gone, however they went: trashed,
 * superseded, never linked or erased. Each row lets go of its streams here,
 * so a folder is handed back once.
 */
export async function retireStreams(
  tx: Tx,
  tenantId: string,
  limit: number,
): Promise<string[]> {
  const rows = await tx.execute<{ folder: string }>(sql`
    with gone as (
      select id, derivatives -> 'hls' ->> 'key' as folder from core.files
      where tenant_id = ${tenantId}::uuid and derivatives ? 'hls'
        and (status = 'tobedeleted' or state = 'rejected')
      order by id limit ${limit}
      for update skip locked
    )
    update core.files f
    set derivatives = f.derivatives - 'hls' - 'poster' - 'thumbnails',
        stream_state = null, stream_leased_until = null, stream_progress = null
    from gone where f.tenant_id = ${tenantId}::uuid and f.id = gone.id
    returning gone.folder`);
  return rows.map((row) => row.folder);
}

/** A video's streams, as a player asks for them. */
export interface FileStream {
  state: "queued" | "encoding" | "ready" | "failed" | null;
  prefix: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export async function streamOf(
  tx: Tx,
  tenantId: string,
  fileId: string,
): Promise<FileStream | null> {
  const [row] = await tx.execute<{
    stream_state: FileStream["state"];
    prefix: string | null;
    width: number | null;
    height: number | null;
    duration_ms: number | null;
  }>(sql`
    select stream_state, derivatives -> 'hls' ->> 'key' as prefix, width, height, duration_ms
    from core.files
    where tenant_id = ${tenantId}::uuid and id = ${fileId}::uuid and status = 'active'`);
  return row
    ? {
        state: row.stream_state,
        prefix: row.prefix,
        width: row.width,
        height: row.height,
        durationMs: row.duration_ms,
      }
    : null;
}

/** How many times a recording's captions are drafted before the draft is given up. */
export const CAPTION_ATTEMPTS = 2;

/** Captions drafted from a recording, as its teacher waits for them. */
export interface CaptionDraft {
  language: "ar" | "en";
  state: "queued" | "working" | "ready" | "failed";
  progress: number | null;
  vtt: string | null;
}

/** Asks for a recording's captions to be drafted, starting over any draft before. */
export async function requestCaptionDraft(
  tx: Tx,
  input: {
    tenantId: string;
    fileId: string;
    language: "ar" | "en";
    userId: string;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.caption_drafts (tenant_id, file_id, language, requested_by_user_id)
    values (${input.tenantId}::uuid, ${input.fileId}::uuid, ${input.language}, ${input.userId}::uuid)
    on conflict (tenant_id, file_id) where status = 'active' do update set
      language = excluded.language, requested_by_user_id = excluded.requested_by_user_id,
      state = 'queued', attempts = 0, leased_until = null, progress = null,
      error = null, vtt = null`);
}

export async function captionDraftOf(
  tx: Tx,
  tenantId: string,
  fileId: string,
): Promise<CaptionDraft | null> {
  const [row] = await tx.execute<{
    language: CaptionDraft["language"];
    state: CaptionDraft["state"];
    progress: number | null;
    vtt: string | null;
  }>(sql`
    select language, state, progress, vtt from core.caption_drafts
    where tenant_id = ${tenantId}::uuid and file_id = ${fileId}::uuid and status = 'active'`);
  return row ?? null;
}

/** A recording whose captions the media service is to draft. */
export interface CaptionJob {
  fileId: string;
  storageKey: string;
  language: "ar" | "en";
}

/**
 * The oldest draft waiting, leased to the caller until `until`; one whose
 * lease ran out, its worker gone, is taken again.
 */
export async function claimCaptionDraft(
  tx: Tx,
  input: { tenantId: string; now: Date; until: Date },
): Promise<CaptionJob | null> {
  const [row] = await tx.execute<{
    file_id: string;
    storage_key: string;
    language: CaptionJob["language"];
  }>(sql`
    with next as (
      select d.id from core.caption_drafts d
      join core.files f on f.tenant_id = d.tenant_id and f.id = d.file_id
        and f.status = 'active' and f.state = 'ready'
      where d.tenant_id = ${input.tenantId}::uuid and d.status = 'active'
        and d.attempts < ${CAPTION_ATTEMPTS}
        and (d.state = 'queued'
          or (d.state = 'working' and d.leased_until < ${input.now.toISOString()}::timestamptz))
      order by d.created_at
      limit 1
      for update of d skip locked
    )
    update core.caption_drafts d
    set state = 'working', attempts = d.attempts + 1, progress = 0,
        leased_until = ${input.until.toISOString()}::timestamptz
    from next, core.files f
    where d.tenant_id = ${input.tenantId}::uuid and d.id = next.id
      and f.tenant_id = d.tenant_id and f.id = d.file_id
    returning d.file_id, f.storage_key, d.language`);
  return row
    ? {
        fileId: row.file_id,
        storageKey: row.storage_key,
        language: row.language,
      }
    : null;
}

/** How far a draft has got, which also keeps its lease. */
export async function captionDraftProgress(
  tx: Tx,
  input: { tenantId: string; fileId: string; progress: number; until: Date },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.caption_drafts
    set progress = ${Math.min(1, Math.max(0, input.progress))},
        leased_until = ${input.until.toISOString()}::timestamptz
    where tenant_id = ${input.tenantId}::uuid and file_id = ${input.fileId}::uuid
      and status = 'active' and state = 'working'
    returning id`);
  return rows.length > 0;
}

export async function captionDraftReady(
  tx: Tx,
  input: { tenantId: string; fileId: string; vtt: string },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.caption_drafts
    set state = 'ready', progress = 1, leased_until = null, error = null, vtt = ${input.vtt}
    where tenant_id = ${input.tenantId}::uuid and file_id = ${input.fileId}::uuid
      and status = 'active' and state = 'working'
    returning id`);
  return rows.length > 0;
}

/** A draft failed: tried again later, or given up after its last attempt. */
export async function captionDraftFailed(
  tx: Tx,
  input: { tenantId: string; fileId: string; error: string },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.caption_drafts
    set state = case when attempts >= ${CAPTION_ATTEMPTS} then 'failed' else 'queued' end,
        leased_until = null, progress = null, error = left(${input.error}, 2000)
    where tenant_id = ${input.tenantId}::uuid and file_id = ${input.fileId}::uuid
      and status = 'active' and state = 'working'
    returning id`);
  return rows.length > 0;
}
