import type { PictureCredit } from "@faridalms/domain/commons";
import type { AreaSort, FileKind } from "@faridalms/domain/file";
import type { CropRatio } from "@faridalms/domain/media-library";

import { LIBRARY_AREA } from "@faridalms/domain/media-library";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { kindOfFile } from "./files";
import { holds, isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

/** The library's own area: the school keeps it, by the school's id. */
export const libraryArea = (orgId: string) => ({
  type: LIBRARY_AREA,
  id: orgId,
});

export interface LibraryFolder {
  id: string;
  name: string;
  parentId: string | null;
  /** Items in it, not counting those in the trash or in its folders. */
  items: number;
}

/** Every folder of a school's library, by name. */
export async function libraryFolders(
  tx: Tx,
  tenantId: string,
  orgId: string,
): Promise<LibraryFolder[]> {
  const rows = await tx.execute<{
    id: string;
    name: string;
    parent_id: string | null;
    items: number;
  }>(sql`
    select m.id, m.name, m.parent_id,
      (select count(*)::int from core.files f
        where f.tenant_id = m.tenant_id and f.host_type = ${LIBRARY_AREA}
          and f.host_id = m.org_id and f.folder_id = m.id
          and f.status = 'active' and f.state = 'ready' and f.trashed_at is null) as items
    from core.media_folders m
    where m.tenant_id = ${tenantId}::uuid and m.org_id = ${orgId}::uuid and m.status = 'active'
    order by lower(m.name), m.id`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    items: row.items,
  }));
}

export async function insertMediaFolder(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    parentId: string | null;
    name: string;
  },
): Promise<{ id: string } | null> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.media_folders (tenant_id, org_id, parent_id, name)
    select ${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.parentId}::uuid, ${input.name}
    where ${input.parentId}::uuid is null or exists (
      select 1 from core.media_folders p
      where p.tenant_id = ${input.tenantId}::uuid and p.org_id = ${input.orgId}::uuid
        and p.id = ${input.parentId}::uuid and p.status = 'active')
    returning id`);
  return row ?? null;
}

export async function renameMediaFolder(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string; name: string },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.media_folders set name = ${input.name}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'
    returning id`);
  return rows.length > 0;
}

/**
 * Takes away an empty folder. One still holding items, in the trash or
 * not, or other folders is kept, so nothing is lost with it.
 */
export async function retireMediaFolder(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<"removed" | "not_empty" | "missing"> {
  const [row] = await tx.execute<{ found: boolean; empty: boolean }>(sql`
    select true as found,
      not exists (
        select 1 from core.files f
        where f.tenant_id = m.tenant_id and f.folder_id = m.id and f.status = 'active')
      and not exists (
        select 1 from core.media_folders c
        where c.tenant_id = m.tenant_id and c.parent_id = m.id and c.status = 'active') as empty
    from core.media_folders m
    where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.orgId}::uuid
      and m.id = ${input.id}::uuid and m.status = 'active'`);
  if (!row) return "missing";
  if (!row.empty) return "not_empty";
  await tx.execute(sql`
    update core.media_folders set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid`);
  return "removed";
}

export interface LibraryItem {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  trashedAt: string | null;
  folderId: string | null;
  description: string;
  credit: PictureCredit | null;
  /** The records whose documents show it. */
  uses: number;
}

type ItemRecord = {
  id: string;
  name: string;
  media_type: string;
  size_bytes: string | number;
  width: number | null;
  height: number | null;
  created_at: string;
  trashed_at: string | null;
  folder_id: string | null;
  description: string | null;
  credit: PictureCredit | null;
  uses: number;
};

const itemColumns = sql`f.id, f.name, f.media_type, f.size_bytes, f.width, f.height,
  ${isoOf(sql`f.created_at`)} as created_at, ${isoOf(sql`f.trashed_at`)} as trashed_at,
  f.folder_id, f.description, f.credit,
  (select count(distinct (d.host_type, d.host_id))::int from core.document_files l
    join core.documents d on d.tenant_id = l.tenant_id and d.id = l.document_id
      and d.status = 'active'
    where l.tenant_id = f.tenant_id and l.file_id = f.id and l.status = 'active') as uses`;

const itemOf = (row: ItemRecord): LibraryItem => ({
  id: row.id,
  name: row.name,
  mediaType: row.media_type,
  sizeBytes: Number(row.size_bytes),
  width: row.width,
  height: row.height,
  createdAt: row.created_at,
  trashedAt: row.trashed_at,
  folderId: row.folder_id,
  description: row.description ?? "",
  credit: row.credit,
  uses: row.uses,
});

const inLibrary = (tenantId: string, orgId: string) =>
  sql`f.tenant_id = ${tenantId}::uuid and f.host_type = ${LIBRARY_AREA}
    and f.host_id = ${orgId}::uuid and f.status = 'active' and f.state = 'ready'`;

/**
 * What a page of the library shows: one folder's items, or, while
 * searching, the matches in every folder; the trash lists everything in it.
 */
function shownWhere(view: {
  folderId: string | null;
  trashed: boolean;
  q: string;
}) {
  const everywhere = view.trashed || view.q.trim() !== "";
  return sql`(f.trashed_at is not null) = ${view.trashed}
    and (${everywhere}::boolean or f.folder_id is not distinct from ${view.folderId}::uuid)
    and (${holds(view.q, [sql`f.name`, sql`coalesce(f.description, '')`])})`;
}

export async function libraryItems(
  tx: Tx,
  tenantId: string,
  orgId: string,
  view: {
    folderId: string | null;
    trashed: boolean;
    q: string;
    kinds: readonly FileKind[];
    sort: AreaSort;
    order: "asc" | "desc";
    limit: number;
    offset: number;
  },
): Promise<{ rows: LibraryItem[]; total: number }> {
  const dir = view.order === "asc" ? sql`asc` : sql`desc`;
  const order =
    view.sort === "name"
      ? sql`lower(f.name) ${dir}, f.id`
      : view.sort === "size"
        ? sql`f.size_bytes ${dir}, f.id`
        : sql`coalesce(f.trashed_at, f.created_at) ${dir}, f.id`;
  const rows = await tx.execute<ItemRecord & { total: number }>(sql`
    select ${itemColumns}, (count(*) over ())::int as total
    from core.files f
    where ${inLibrary(tenantId, orgId)} and ${shownWhere(view)}
      ${
        view.kinds.length
          ? sql`and ${kindOfFile} in (${sql.join(
              view.kinds.map((kind) => sql`${kind}`),
              sql`, `,
            )})`
          : sql``
      }
    order by ${order}
    limit ${view.limit} offset ${view.offset}`);
  return { total: rows[0]?.total ?? 0, rows: rows.map(itemOf) };
}

/** How many of what a page of the library shows are of each kind. */
export async function libraryKindCounts(
  tx: Tx,
  tenantId: string,
  orgId: string,
  view: { folderId: string | null; trashed: boolean; q: string },
): Promise<Partial<Record<FileKind, number>>> {
  const rows = await tx.execute<{ kind: FileKind; count: number }>(sql`
    select ${kindOfFile} as kind, count(*)::int as count
    from core.files f
    where ${inLibrary(tenantId, orgId)} and ${shownWhere(view)}
    group by 1`);
  return Object.fromEntries(rows.map((row) => [row.kind, row.count]));
}

/** Library items by id, in the trash or not; others are left out. */
export async function libraryItemsByIds(
  tx: Tx,
  tenantId: string,
  orgId: string,
  ids: readonly string[],
): Promise<LibraryItem[]> {
  if (ids.length === 0) return [];
  const rows = await tx.execute<ItemRecord>(sql`
    select ${itemColumns} from core.files f
    where ${inLibrary(tenantId, orgId)} and f.id = any(${uuidArray(ids)})`);
  return rows.map(itemOf);
}

export interface LibraryUse {
  hostType: string;
  hostId: string;
  titleEn: string | null;
  titleAr: string | null;
}

/**
 * The records whose documents show a file, in either language, by the
 * title of each: lessons, assignments, unit plans, notices, news, events,
 * website pages and shared blocks. Others are named by their kind alone.
 */
export async function fileUses(
  tx: Tx,
  tenantId: string,
  fileId: string,
): Promise<LibraryUse[]> {
  const rows = await tx.execute<{
    host_type: string;
    host_id: string;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    with hosts as (
      select distinct d.host_type, d.host_id from core.document_files l
      join core.documents d on d.tenant_id = l.tenant_id and d.id = l.document_id
        and d.status = 'active'
      where l.tenant_id = ${tenantId}::uuid and l.file_id = ${fileId}::uuid
        and l.status = 'active')
    select h.host_type, h.host_id,
      coalesce(ls.title, a.title, m.title, nullif(n.title_en, ''), nullif(sp.title_en, ''),
        e.title_en, sb.title) as title_en,
      coalesce(ls.title, a.title, m.title, nullif(n.title_ar, ''), nullif(sp.title_ar, ''),
        e.title_ar, sb.title) as title_ar
    from hosts h
    left join core.lessons ls on ls.tenant_id = ${tenantId}::uuid and ls.id = h.host_id
      and h.host_type = 'lesson'
    left join core.assignments a on a.tenant_id = ${tenantId}::uuid and a.id = h.host_id
      and h.host_type = 'assignment'
    left join core.learning_modules m on m.tenant_id = ${tenantId}::uuid and m.id = h.host_id
      and h.host_type = 'module_plan'
    left join core.broadcasts n on n.tenant_id = ${tenantId}::uuid and n.id = h.host_id
      and h.host_type = n.kind
    left join core.site_pages sp on sp.tenant_id = ${tenantId}::uuid and sp.id = h.host_id
      and h.host_type = 'site_page'
    left join core.calendar_events e on e.tenant_id = ${tenantId}::uuid and e.id = h.host_id
      and h.host_type = 'calendar_event'
    left join core.shared_blocks sb on sb.tenant_id = ${tenantId}::uuid and sb.id = h.host_id
      and h.host_type = 'shared_block'
    order by h.host_type, title_en nulls last, h.host_id
    limit 200`);
  return rows.map((row) => ({
    hostType: row.host_type,
    hostId: row.host_id,
    titleEn: row.title_en,
    titleAr: row.title_ar,
  }));
}

export async function describeLibraryItem(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    name: string;
    description: string;
    credit: PictureCredit | null;
  },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.files f
    set name = ${input.name}, description = nullif(${input.description}, ''),
      credit = ${input.credit}::jsonb
    where ${inLibrary(input.tenantId, input.orgId)} and f.id = ${input.id}::uuid
    returning f.id`);
  return rows.length > 0;
}

/**
 * Files library items in a folder, or at the top for none; a folder of
 * another school is refused. Answers the ids moved.
 */
export async function moveLibraryItems(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    ids: readonly string[];
    folderId: string | null;
  },
): Promise<string[]> {
  if (input.ids.length === 0) return [];
  const rows = await tx.execute<{ id: string }>(sql`
    update core.files f set folder_id = ${input.folderId}::uuid
    where ${inLibrary(input.tenantId, input.orgId)} and f.id = any(${uuidArray(input.ids)})
      and (${input.folderId}::uuid is null or exists (
        select 1 from core.media_folders m
        where m.tenant_id = f.tenant_id and m.org_id = ${input.orgId}::uuid
          and m.id = ${input.folderId}::uuid and m.status = 'active'))
    returning f.id`);
  return rows.map((row) => row.id);
}

/** Sets what a new library item says of itself, as it was shown or kept. */
export async function setLibraryWords(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    description: string;
    credit: PictureCredit | null;
  },
): Promise<void> {
  await tx.execute(sql`
    update core.files f
    set description = nullif(${input.description}, ''),
      credit = ${input.credit}::jsonb
    where ${inLibrary(input.tenantId, input.orgId)} and f.id = ${input.id}::uuid`);
}

/** Says a picture shows whom another shows, as a crop or a kept copy does. */
export async function copySubjects(
  tx: Tx,
  input: { tenantId: string; from: string; to: string; taggedBy: string },
): Promise<void> {
  await tx.execute(sql`
    insert into core.file_subjects (tenant_id, file_id, user_id, tagged_by_user_id)
    select s.tenant_id, ${input.to}::uuid, s.user_id, ${input.taggedBy}::uuid
    from core.file_subjects s
    where s.tenant_id = ${input.tenantId}::uuid and s.file_id = ${input.from}::uuid
      and s.status = 'active'
      and not exists (
        select 1 from core.file_subjects t
        where t.tenant_id = s.tenant_id and t.file_id = ${input.to}::uuid
          and t.user_id = s.user_id and t.status = 'active')`);
}

/**
 * Makes a cropped picture a library item beside its original: in its
 * folder, with its description and credit, and naming what it was cut
 * from and to what shape.
 */
export async function deriveLibraryItem(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    sourceId: string;
    fileId: string;
    name: string;
    ratio: CropRatio;
  },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.files f
    set folder_id = s.folder_id, description = s.description, credit = s.credit,
      name = ${input.name},
      metadata = f.metadata || jsonb_build_object('croppedFrom', s.id::text, 'ratio', ${input.ratio}::text)
    from core.files s
    where ${inLibrary(input.tenantId, input.orgId)} and f.id = ${input.fileId}::uuid
      and s.tenant_id = f.tenant_id and s.id = ${input.sourceId}::uuid
      and s.host_type = f.host_type and s.host_id = f.host_id and s.status = 'active'
    returning f.id`);
  return rows.length > 0;
}
