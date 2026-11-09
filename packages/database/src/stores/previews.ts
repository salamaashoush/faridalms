import type { PreviewKind, PreviewSize } from "@faridalms/domain/previews";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { PreviewState } from "../tables/previews";

import { textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

/** How many times previews are tried before a file is shown without them. */
export const PREVIEW_ATTEMPTS = 3;

/** Where a file's previews are kept in the store, beside its bytes. */
export const previewFolder = (tenantId: string, previewId: string) =>
  `t/${tenantId}/r/${previewId}`;

/** The previews made from a file's bytes, as readers show them. */
export interface StoredPreview {
  id: string;
  storageKey: string;
  kind: PreviewKind;
  state: PreviewState;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  placeholder: string | null;
  sizes: PreviewSize[];
  waveform: number[] | null;
  pages: number | null;
  documentBytes: number | null;
}

type PreviewRecord = {
  id: string;
  storage_key: string;
  kind: PreviewKind;
  state: PreviewState;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  placeholder: string | null;
  sizes: PreviewSize[];
  waveform: number[] | null;
  pages: number | null;
  document_bytes: string | number | null;
};

const previewOf = (row: PreviewRecord): StoredPreview => ({
  id: row.id,
  storageKey: row.storage_key,
  kind: row.kind,
  state: row.state,
  width: row.width,
  height: row.height,
  durationMs: row.duration_ms,
  placeholder: row.placeholder,
  sizes: row.sizes,
  waveform: row.waveform,
  pages: row.pages,
  documentBytes:
    row.document_bytes === null ? null : Number(row.document_bytes),
});

/**
 * Asks for a file's previews, once for its bytes: a copy sharing them, or
 * a file asked again, finds them already asked for.
 */
export async function queuePreview(
  tx: Tx,
  input: {
    tenantId: string;
    storageKey: string;
    mediaType: string;
    kind: PreviewKind;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.file_previews (tenant_id, storage_key, kind, media_type)
    values (${input.tenantId}::uuid, ${input.storageKey}, ${input.kind}, ${input.mediaType})
    on conflict (tenant_id, storage_key) where status = 'active' do nothing`);
}

/** The previews of these stored objects, by key; those not asked for are left out. */
export async function previewsOf(
  tx: Tx,
  tenantId: string,
  storageKeys: readonly string[],
): Promise<Map<string, StoredPreview>> {
  if (storageKeys.length === 0) return new Map();
  const rows = await tx.execute<PreviewRecord>(sql`
    select id, storage_key, kind, state, width, height, duration_ms, placeholder, sizes,
      waveform, pages, document_bytes
    from core.file_previews
    where tenant_id = ${tenantId}::uuid and status = 'active'
      and storage_key = any(${textArray(storageKeys)})`);
  return new Map(rows.map((row) => [row.storage_key, previewOf(row)]));
}

/** A file's previews the media service is to make. */
export interface PreviewJob {
  id: string;
  storageKey: string;
  mediaType: string;
  kind: PreviewKind;
  /**
   * Whether the picture may be turned upright in place. Bytes a handed-in
   * attempt holds never change, since the work as handed in is the record.
   */
  rewrite: boolean;
}

/**
 * The oldest previews waiting of the kinds the worker can make, leased to
 * it until `until`; one whose lease ran out, its worker gone, is taken
 * again. Bytes no active file holds any longer are passed over, for the
 * sweep to retire.
 */
export async function claimPreview(
  tx: Tx,
  input: {
    tenantId: string;
    now: Date;
    until: Date;
    kinds: readonly PreviewKind[];
  },
): Promise<PreviewJob | null> {
  if (input.kinds.length === 0) return null;
  const [row] = await tx.execute<{
    id: string;
    storage_key: string;
    media_type: string;
    kind: PreviewKind;
    frozen: boolean;
  }>(sql`
    with next as (
      select p.id from core.file_previews p
      where p.tenant_id = ${input.tenantId}::uuid and p.status = 'active'
        and p.kind = any(${textArray(input.kinds)})
        and p.attempts < ${PREVIEW_ATTEMPTS}
        and (p.state = 'queued'
          or (p.state = 'working' and p.leased_until < ${input.now.toISOString()}::timestamptz))
        and exists (select 1 from core.files f
          where f.tenant_id = p.tenant_id and f.storage_key = p.storage_key
            and f.status = 'active' and f.state = 'ready')
      order by p.created_at
      limit 1
      for update of p skip locked
    )
    update core.file_previews p
    set state = 'working', attempts = p.attempts + 1, progress = 0,
        leased_until = ${input.until.toISOString()}::timestamptz
    from next where p.tenant_id = ${input.tenantId}::uuid and p.id = next.id
    returning p.id, p.storage_key, p.media_type, p.kind,
      exists (select 1 from core.files f
        where f.tenant_id = p.tenant_id and f.storage_key = p.storage_key
          and f.status = 'active' and f.host_type = 'submission_attempt') as frozen`);
  return row
    ? {
        id: row.id,
        storageKey: row.storage_key,
        mediaType: row.media_type,
        kind: row.kind,
        rewrite: row.kind === "picture" && !row.frozen,
      }
    : null;
}

/** How far a preview has got, which also keeps its lease. */
export async function previewProgress(
  tx: Tx,
  input: { tenantId: string; id: string; progress: number; until: Date },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.file_previews
    set progress = ${Math.min(1, Math.max(0, input.progress))},
        leased_until = ${input.until.toISOString()}::timestamptz
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and status = 'active' and state = 'working'
    returning id`);
  return rows.length > 0;
}

/** What the media service made of a file's bytes. */
export interface MadePreview {
  width?: number | undefined;
  height?: number | undefined;
  durationMs?: number | undefined;
  placeholder?: string | undefined;
  sizes: PreviewSize[];
  waveform?: number[] | undefined;
  pages?: number | undefined;
  documentBytes?: number | undefined;
  /** The picture turned upright in place of what was uploaded. */
  source?: { sizeBytes: number; sha256: string } | undefined;
  bytes: number;
}

/**
 * A file's previews are ready. A picture's size and a recording's length
 * are the file's own too, set on every row holding the bytes; a picture
 * turned upright in place changes what each of them weighs and hashes to.
 * Answers the bytes' key, or null when the previews were not being made.
 */
export async function previewReady(
  tx: Tx,
  input: { tenantId: string; id: string; made: MadePreview },
): Promise<string | null> {
  const made = input.made;
  const [row] = await tx.execute<{
    storage_key: string;
    kind: PreviewKind;
  }>(sql`
    update core.file_previews
    set state = 'ready', progress = 1, leased_until = null, error = null,
        width = ${made.width ?? null}, height = ${made.height ?? null},
        duration_ms = ${made.durationMs ?? null}, placeholder = ${made.placeholder ?? null},
        sizes = ${JSON.stringify(made.sizes)}::text::jsonb,
        waveform = ${made.waveform ? JSON.stringify(made.waveform) : null}::text::jsonb,
        pages = ${made.pages ?? null}, document_bytes = ${made.documentBytes ?? null},
        bytes = ${made.bytes}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and status = 'active' and state = 'working'
    returning storage_key, kind`);
  if (!row) return null;
  const picture = row.kind === "picture";
  await tx.execute(sql`
    update core.files
    set width = case when ${picture} then ${made.width ?? null}::int else width end,
        height = case when ${picture} then ${made.height ?? null}::int else height end,
        duration_ms = case when ${row.kind === "audio"} then ${made.durationMs ?? null}::int
          else duration_ms end,
        size_bytes = coalesce(${made.source?.sizeBytes ?? null}::bigint, size_bytes),
        sha256 = coalesce(decode(${made.source?.sha256 ?? null}::text, 'hex'), sha256)
    where tenant_id = ${input.tenantId}::uuid and storage_key = ${row.storage_key}
      and status = 'active'`);
  return row.storage_key;
}

/** Previews failed: tried again later, or given up after the last attempt. */
export async function previewFailed(
  tx: Tx,
  input: { tenantId: string; id: string; error: string },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.file_previews
    set state = case when attempts >= ${PREVIEW_ATTEMPTS} then 'failed' else 'queued' end,
        leased_until = null, progress = null, error = left(${input.error}, 2000)
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and status = 'active' and state = 'working'
    returning id`);
  return rows.length > 0;
}

/** A worker hands previews back unspent, as it hands back an encode. */
export async function previewReleased(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.file_previews
    set state = 'queued', attempts = greatest(attempts - 1, 0),
        leased_until = null, progress = null
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and status = 'active' and state = 'working'
    returning id`);
  return rows.length > 0;
}

/**
 * The folders of previews whose bytes no active file holds any longer,
 * however the files went. Each row lets go of its folder here, so a folder
 * is handed back once.
 */
export async function retirePreviews(
  tx: Tx,
  tenantId: string,
  limit: number,
): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    with gone as (
      select p.id from core.file_previews p
      where p.tenant_id = ${tenantId}::uuid and p.status = 'active'
        and not exists (select 1 from core.files f
          where f.tenant_id = p.tenant_id and f.storage_key = p.storage_key
            and f.status = 'active' and f.state = 'ready')
      order by p.id limit ${limit}
      for update of p skip locked
    )
    update core.file_previews p set status = 'tobedeleted', state = 'failed',
      leased_until = null
    from gone where p.tenant_id = ${tenantId}::uuid and p.id = gone.id
    returning p.id`);
  return rows.map((row) => previewFolder(tenantId, row.id));
}

/** A ready file whose bytes were stored before previews were made on upload. */
export interface UnpreviewedFile {
  storageKey: string;
  mediaType: string;
  purpose: string;
  /** Held by a handed-in attempt, whose bytes never change. */
  frozen: boolean;
}

/**
 * Ready files no previews were ever asked for, oldest first, for the
 * backfill to clean and queue. Files sealed at rest are left out, since
 * nothing is made from them.
 */
export async function unpreviewedFiles(
  tx: Tx,
  tenantId: string,
  input: {
    /** Media types, or `like` patterns of them, that get previews. */
    mediaTypes: readonly string[];
    /** Purposes whose files get none. */
    unshown: readonly string[];
    limit: number;
  },
): Promise<UnpreviewedFile[]> {
  const rows = await tx.execute<{
    storage_key: string;
    media_type: string;
    purpose: string;
    frozen: boolean;
  }>(sql`
    select distinct on (f.storage_key) f.storage_key, f.media_type, f.purpose,
      exists (select 1 from core.files h
        where h.tenant_id = f.tenant_id and h.storage_key = f.storage_key
          and h.status = 'active' and h.host_type = 'submission_attempt') as frozen
    from core.files f
    where f.tenant_id = ${tenantId}::uuid and f.status = 'active' and f.state = 'ready'
      and f.encryption = 'bucket'
      and starts_with(f.storage_key, ${`t/${tenantId}/f/`})
      and lower(f.media_type) like any(${textArray(input.mediaTypes)})
      and not (f.purpose = any(${textArray(input.unshown)}))
      and not exists (select 1 from core.file_previews p
        where p.tenant_id = f.tenant_id and p.storage_key = f.storage_key
          and p.status = 'active')
    order by f.storage_key, f.ready_at
    limit ${input.limit}`);
  return rows.map((row) => ({
    storageKey: row.storage_key,
    mediaType: row.media_type,
    purpose: row.purpose,
    frozen: row.frozen,
  }));
}

/**
 * Bytes cleaned in place: every file holding them now weighs and hashes to
 * what was written.
 */
export async function bytesRewritten(
  tx: Tx,
  input: {
    tenantId: string;
    storageKey: string;
    sizeBytes: number;
    sha256: string;
  },
): Promise<void> {
  await tx.execute(sql`
    update core.files
    set size_bytes = ${input.sizeBytes}, sha256 = decode(${input.sha256}, 'hex')
    where tenant_id = ${input.tenantId}::uuid and storage_key = ${input.storageKey}
      and status = 'active'`);
}

/** Where the subject of each of these pictures sits, where its media item says. */
export async function focusOfFiles(
  tx: Tx,
  tenantId: string,
  ids: readonly string[],
): Promise<Map<string, { x: number; y: number }>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.execute<{ id: string; x: number; y: number }>(sql`
    select id, (metadata #>> '{focus,x}')::int as x, (metadata #>> '{focus,y}')::int as y
    from core.files
    where tenant_id = ${tenantId}::uuid and id = any(${uuidArray(ids)})
      and metadata ? 'focus'`);
  return new Map(rows.map((row) => [row.id, { x: row.x, y: row.y }]));
}
