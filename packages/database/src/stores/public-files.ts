import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface Publication {
  fileId: string;
  publicKey: string;
  /** A size made of the file, published beside it; none for the file itself. */
  derivative: string | null;
}

/** The files a page or post shows publicly now, by the key each is served under. */
export async function publicationsOf(
  tx: Tx,
  input: { tenantId: string; hostType: string; hostId: string },
): Promise<Publication[]> {
  const rows = await tx.execute<{
    file_id: string;
    public_key: string;
    derivative: string | null;
  }>(sql`
    select file_id, public_key, derivative from core.file_publications
    where tenant_id = ${input.tenantId}::uuid and host_type = ${input.hostType}
      and host_id = ${input.hostId}::uuid and status = 'active' and unpublished_at is null`);
  return rows.map((row) => ({
    fileId: row.file_id,
    publicKey: row.public_key,
    derivative: row.derivative,
  }));
}

export async function recordPublication(
  tx: Tx,
  input: {
    tenantId: string;
    fileId: string;
    purpose: string;
    publicKey: string;
    hostType: string;
    hostId: string;
    derivative?: string | null;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.file_publications (tenant_id, file_id, file_purpose, public_key, host_type,
      host_id, derivative)
    values (${input.tenantId}::uuid, ${input.fileId}::uuid, ${input.purpose}, ${input.publicKey},
      ${input.hostType}, ${input.hostId}::uuid, ${input.derivative ?? null})`);
}

/** A public copy of a file, where it is published and the sizes already beside it. */
export interface PublishedHolder {
  fileId: string;
  purpose: string;
  publicKey: string;
  hostType: string;
  hostId: string;
  derivatives: string[];
}

/** Every page or post showing a file with these bytes publicly now. */
export async function publishedHolders(
  tx: Tx,
  input: { tenantId: string; storageKey: string },
): Promise<PublishedHolder[]> {
  const rows = await tx.execute<{
    file_id: string;
    file_purpose: string;
    public_key: string;
    host_type: string;
    host_id: string;
    derivatives: string[];
  }>(sql`
    select p.file_id, p.file_purpose, p.public_key, p.host_type, p.host_id,
      coalesce((select array_agg(d.derivative) from core.file_publications d
        where d.tenant_id = p.tenant_id and d.file_id = p.file_id
          and d.host_type = p.host_type and d.host_id = p.host_id
          and d.derivative is not null and d.status = 'active' and d.unpublished_at is null),
        '{}')::text[] as derivatives
    from core.file_publications p
    join core.files f on f.tenant_id = p.tenant_id and f.id = p.file_id and f.status = 'active'
    where p.tenant_id = ${input.tenantId}::uuid and f.storage_key = ${input.storageKey}
      and p.derivative is null and p.status = 'active' and p.unpublished_at is null`);
  return rows.map((row) => ({
    fileId: row.file_id,
    purpose: row.file_purpose,
    publicKey: row.public_key,
    hostType: row.host_type,
    hostId: row.host_id,
    derivatives: row.derivatives,
  }));
}

/** Ends the publications of these files for a host; the keys come back so their objects go. */
export async function endPublications(
  tx: Tx,
  input: {
    tenantId: string;
    hostType: string;
    hostId: string;
    keepFileIds: readonly string[];
  },
): Promise<string[]> {
  const rows = await tx.execute<{ public_key: string }>(sql`
    update core.file_publications set unpublished_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and host_type = ${input.hostType}
      and host_id = ${input.hostId}::uuid and status = 'active' and unpublished_at is null
      and not (file_id = any(${uuidArray(input.keepFileIds)}))
    returning public_key`);
  return rows.map((row) => row.public_key);
}

export interface PublishableFile {
  id: string;
  purpose: string;
  name: string;
  storageKey: string;
  mediaType: string;
}

/** The ready files of this school that may be published, by id. */
export async function publishableFiles(
  tx: Tx,
  input: { tenantId: string; fileIds: readonly string[] },
): Promise<PublishableFile[]> {
  if (input.fileIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    purpose: string;
    name: string;
    storage_key: string;
    media_type: string;
  }>(sql`
    select id, purpose, name, storage_key, media_type from core.files
    where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(input.fileIds)})
      and status = 'active' and state = 'ready'
      and purpose = any(${textArray(["site_media", "logo", "document_media"])})`);
  return rows.map((row) => ({
    id: row.id,
    purpose: row.purpose,
    name: row.name,
    storageKey: row.storage_key,
    mediaType: row.media_type,
  }));
}

/**
 * The people shown in these files whose families have not agreed to their
 * picture being shown in this way: the website, or school news. Anything
 * but a current yes counts, so a photo waits until a family has answered.
 */
export async function subjectsWithoutConsent(
  tx: Tx,
  input: {
    tenantId: string;
    fileIds: readonly string[];
    meaning: "photo_website" | "photo_internal";
    /** Today at the school, which an answer must cover. */
    on: string;
  },
): Promise<string[]> {
  if (input.fileIds.length === 0) return [];
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct s.user_id from core.file_subjects s
    where s.tenant_id = ${input.tenantId}::uuid and s.file_id = any(${uuidArray(input.fileIds)})
      and s.status = 'active'
      and not exists (
        select 1 from core.current_consents c
        join core.descriptors d on d.tenant_id = c.tenant_id and d.id = c.purpose_descriptor_id
        where c.tenant_id = s.tenant_id and c.subject_user_id = s.user_id
          and d.system_meaning = ${input.meaning} and c.decision = 'granted'
          and c.valid_during @> ${input.on}::date)`);
  return rows.map((row) => row.user_id);
}

/**
 * Takes down every public copy of a photo showing this person, wherever it
 * was published; the keys come back so the objects go.
 */
export async function endPublicationsShowing(
  tx: Tx,
  input: { tenantId: string; userId: string },
): Promise<{ publicKey: string; hostType: string; hostId: string }[]> {
  const rows = await tx.execute<{
    public_key: string;
    host_type: string;
    host_id: string;
  }>(sql`
    update core.file_publications p set unpublished_at = statement_timestamp()
    where p.tenant_id = ${input.tenantId}::uuid and p.status = 'active' and p.unpublished_at is null
      and exists (
        select 1 from core.file_subjects s
        where s.tenant_id = p.tenant_id and s.file_id = p.file_id
          and s.user_id = ${input.userId}::uuid and s.status = 'active')
    returning p.public_key, p.host_type, p.host_id`);
  return rows.map((row) => ({
    publicKey: row.public_key,
    hostType: row.host_type,
    hostId: row.host_id,
  }));
}
