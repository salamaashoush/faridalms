import type { PictureCredit, PictureFocus } from "@faridalms/domain/commons";
import type { AreaSort, FileKind } from "@faridalms/domain/file";
import type { CropRatio, PictureEdits } from "@faridalms/domain/media-library";

import { LIBRARY_AREA } from "@faridalms/domain/media-library";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { kindOfFile } from "./files";
import { holds, isoOf, textArray, uuidArray } from "./sql";

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

export interface LibraryTag {
  id: string;
  name: string;
}

export interface LibraryPerson {
  id: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
}

export interface LibraryItem {
  id: string;
  name: string;
  /** What people call it, apart from its file's name; empty for none. */
  title: string;
  mediaType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  trashedAt: string | null;
  folderId: string | null;
  description: string;
  /** What a picture block showing it starts its caption from; empty for none. */
  caption: string;
  credit: PictureCredit | null;
  uploadedBy: LibraryPerson | null;
  tags: LibraryTag[];
  /** The records whose documents show it. */
  uses: number;
  /** Where a picture's subject sits, which crops and the website keep in view. */
  focus: PictureFocus | null;
  /** A picture's ThumbHash, drawn while it loads. */
  placeholder: string | null;
  /** Whether a document's first page can be shown as a picture. */
  page: boolean;
  /** Whether an office file can be read as a PDF. */
  pdf: boolean;
}

type ItemRecord = {
  id: string;
  name: string;
  title: string | null;
  media_type: string;
  size_bytes: string | number;
  width: number | null;
  height: number | null;
  created_at: string;
  trashed_at: string | null;
  folder_id: string | null;
  description: string | null;
  caption: string | null;
  credit: PictureCredit | null;
  uploaded_by_user_id: string | null;
  uploader_en: string | null;
  uploader_ar: string | null;
  tags: LibraryTag[];
  uses: number;
  focus: PictureFocus | null;
  placeholder: string | null;
  page: boolean | null;
  pdf: boolean;
};

/** An item's file with its texts and uploader beside it. */
/** A file's previews, where they are ready; joined as `p` beside `f`. */
const withPreview = sql`left join core.file_previews p on p.tenant_id = f.tenant_id
  and p.storage_key = f.storage_key and p.status = 'active' and p.state = 'ready'`;

const itemFrom = sql`core.files f
  left join core.media_item_texts x on x.tenant_id = f.tenant_id and x.file_id = f.id
    and x.status = 'active'
  left join core.users u on u.tenant_id = f.tenant_id and u.id = f.uploaded_by_user_id
  ${withPreview}`;

const itemColumns = sql`f.id, f.name, x.title, f.media_type, f.size_bytes, f.width, f.height,
  ${isoOf(sql`f.created_at`)} as created_at, ${isoOf(sql`f.trashed_at`)} as trashed_at,
  f.folder_id, f.description, x.caption, f.credit, f.uploaded_by_user_id,
  u.full_name_en as uploader_en, u.full_name_ar as uploader_ar,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by lower(g.name))
    from core.media_item_tags it
    join core.media_tags g on g.tenant_id = it.tenant_id and g.id = it.tag_id
      and g.status = 'active'
    where it.tenant_id = f.tenant_id and it.file_id = f.id and it.status = 'active'
  ), '[]'::jsonb) as tags,
  (select count(distinct (d.host_type, d.host_id))::int from core.document_files l
    join core.documents d on d.tenant_id = l.tenant_id and d.id = l.document_id
      and d.status = 'active'
    where l.tenant_id = f.tenant_id and l.file_id = f.id and l.status = 'active') as uses,
  f.metadata -> 'focus' as focus, p.placeholder,
  jsonb_path_exists(p.sizes, '$[*] ? (@.name starts with "page1-")') as page,
  p.document_bytes is not null as pdf`;

const itemOf = (row: ItemRecord): LibraryItem => ({
  id: row.id,
  name: row.name,
  title: row.title ?? "",
  mediaType: row.media_type,
  sizeBytes: Number(row.size_bytes),
  width: row.width,
  height: row.height,
  createdAt: row.created_at,
  trashedAt: row.trashed_at,
  folderId: row.folder_id,
  description: row.description ?? "",
  caption: row.caption ?? "",
  credit: row.credit,
  uploadedBy: row.uploaded_by_user_id
    ? {
        id: row.uploaded_by_user_id,
        fullNameEn: row.uploader_en,
        fullNameAr: row.uploader_ar,
      }
    : null,
  tags: row.tags,
  uses: row.uses,
  focus: row.focus,
  placeholder: row.placeholder,
  page: row.page ?? false,
  pdf: row.pdf,
});

const inLibrary = (tenantId: string, orgId: string) =>
  sql`f.tenant_id = ${tenantId}::uuid and f.host_type = ${LIBRARY_AREA}
    and f.host_id = ${orgId}::uuid and f.status = 'active' and f.state = 'ready'`;

/** The month an item was added in the school's time zone, as `2026-11`. */
const monthOf = (zone: string) =>
  sql`to_char(f.created_at at time zone ${zone}, 'YYYY-MM')`;

export interface LibraryView {
  folderId: string | null;
  trashed: boolean;
  q: string;
  months: readonly string[];
  uploaders: readonly string[];
  tags: readonly string[];
  /** The school's time zone, which months are counted in. */
  zone: string;
}

/**
 * What a page of the library shows: one folder's items, or, while
 * searching or filtering by month, uploader or tag, the matches in every
 * folder; the trash lists everything in it. Tags narrow to items carrying
 * every one chosen.
 */
function shownWhere(view: LibraryView) {
  const everywhere =
    view.trashed ||
    view.q.trim() !== "" ||
    view.months.length > 0 ||
    view.uploaders.length > 0 ||
    view.tags.length > 0;
  return sql`(f.trashed_at is not null) = ${view.trashed}
    and (${everywhere}::boolean or f.folder_id is not distinct from ${view.folderId}::uuid)
    and (${holds(view.q, [
      sql`f.name`,
      sql`coalesce(f.description, '')`,
      sql`coalesce(x.title, '')`,
      sql`coalesce(x.caption, '')`,
    ])})
    and (${view.months.length === 0}::boolean
      or ${monthOf(view.zone)} = any(${textArray(view.months)}))
    and (${view.uploaders.length === 0}::boolean
      or f.uploaded_by_user_id = any(${uuidArray(view.uploaders)}))
    and (${view.tags.length === 0}::boolean or (
      select count(distinct it.tag_id) from core.media_item_tags it
      where it.tenant_id = f.tenant_id and it.file_id = f.id and it.status = 'active'
        and it.tag_id = any(${uuidArray(view.tags)})) = ${view.tags.length})`;
}

export async function libraryItems(
  tx: Tx,
  tenantId: string,
  orgId: string,
  view: LibraryView & {
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
      ? sql`lower(coalesce(x.title, f.name)) ${dir}, f.id`
      : view.sort === "size"
        ? sql`f.size_bytes ${dir}, f.id`
        : sql`coalesce(f.trashed_at, f.created_at) ${dir}, f.id`;
  const rows = await tx.execute<ItemRecord & { total: number }>(sql`
    select ${itemColumns}, (count(*) over ())::int as total
    from ${itemFrom}
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
  view: LibraryView,
): Promise<Partial<Record<FileKind, number>>> {
  const rows = await tx.execute<{ kind: FileKind; count: number }>(sql`
    select ${kindOfFile} as kind, count(*)::int as count
    from ${itemFrom}
    where ${inLibrary(tenantId, orgId)} and ${shownWhere(view)}
    group by 1`);
  return Object.fromEntries(rows.map((row) => [row.kind, row.count]));
}

export interface LibraryFacets {
  /** The months items were added in, newest first. */
  months: { month: string; count: number }[];
  /** Who uploaded the library's items, by name. */
  uploaders: (LibraryPerson & { count: number })[];
  /** The school's tags, by name, with the items each holds. */
  tags: (LibraryTag & { count: number })[];
}

/** What the library's items may be narrowed by, counted over all of them outside the trash. */
export async function libraryFacets(
  tx: Tx,
  tenantId: string,
  orgId: string,
  zone: string,
): Promise<LibraryFacets> {
  const [months, uploaders, tags] = await Promise.all([
    tx.execute<{ month: string; count: number }>(sql`
      select ${monthOf(zone)} as month, count(*)::int as count
      from core.files f
      where ${inLibrary(tenantId, orgId)} and f.trashed_at is null
      group by 1 order by 1 desc limit 120`),
    tx.execute<{
      id: string;
      full_name_en: string | null;
      full_name_ar: string | null;
      count: number;
    }>(sql`
      select u.id, u.full_name_en, u.full_name_ar, count(*)::int as count
      from core.files f
      join core.users u on u.tenant_id = f.tenant_id and u.id = f.uploaded_by_user_id
      where ${inLibrary(tenantId, orgId)} and f.trashed_at is null
      group by u.id, u.full_name_en, u.full_name_ar
      order by u.full_name_en nulls last, u.full_name_ar, u.id limit 200`),
    tx.execute<{ id: string; name: string; count: number }>(sql`
      select g.id, g.name, (
        select count(*)::int from core.media_item_tags it
        join core.files f on f.tenant_id = it.tenant_id and f.id = it.file_id
        where it.tenant_id = g.tenant_id and it.tag_id = g.id and it.status = 'active'
          and ${inLibrary(tenantId, orgId)} and f.trashed_at is null) as count
      from core.media_tags g
      where g.tenant_id = ${tenantId}::uuid and g.org_id = ${orgId}::uuid
        and g.status = 'active'
      order by lower(g.name), g.id limit 500`),
  ]);
  return {
    months,
    uploaders: uploaders.map((row) => ({
      id: row.id,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
      count: row.count,
    })),
    tags,
  };
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
    select ${itemColumns} from ${itemFrom}
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
    /** How it was turned, mirrored or resized as well, if it was. */
    edits?: PictureEdits | null;
  },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.files f
    set folder_id = s.folder_id, description = s.description, credit = s.credit,
      name = ${input.name},
      metadata = f.metadata || jsonb_strip_nulls(jsonb_build_object('croppedFrom', s.id::text,
        'ratio', ${input.ratio}::text, 'edits', ${input.edits ?? null}::jsonb))
    from core.files s
    where ${inLibrary(input.tenantId, input.orgId)} and f.id = ${input.fileId}::uuid
      and s.tenant_id = f.tenant_id and s.id = ${input.sourceId}::uuid
      and s.host_type = f.host_type and s.host_id = f.host_id and s.status = 'active'
    returning f.id`);
  return rows.length > 0;
}

/** Sets an item's title and caption; empty words clear them. */
export async function setLibraryTexts(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    title: string;
    caption: string;
  },
): Promise<void> {
  const title = input.title.trim() || null;
  const caption = input.caption.trim() || null;
  await tx.execute(sql`
    insert into core.media_item_texts (tenant_id, file_id, title, caption)
    select f.tenant_id, f.id, ${title}, ${caption}
    from core.files f
    where ${inLibrary(input.tenantId, input.orgId)} and f.id = ${input.id}::uuid
    on conflict (tenant_id, file_id) where status = 'active'
    do update set title = excluded.title, caption = excluded.caption`);
}

/**
 * Gives a new item the title, caption and tags of the one it came from,
 * as a crop keeps its original's.
 */
export async function copyLibraryTexts(
  tx: Tx,
  input: { tenantId: string; from: string; to: string; taggedBy: string },
): Promise<void> {
  await tx.execute(sql`
    insert into core.media_item_texts (tenant_id, file_id, title, caption)
    select x.tenant_id, ${input.to}::uuid, x.title, x.caption
    from core.media_item_texts x
    where x.tenant_id = ${input.tenantId}::uuid and x.file_id = ${input.from}::uuid
      and x.status = 'active'
    on conflict (tenant_id, file_id) where status = 'active' do nothing`);
  await tx.execute(sql`
    insert into core.media_item_tags (tenant_id, file_id, tag_id, tagged_by_user_id)
    select it.tenant_id, ${input.to}::uuid, it.tag_id, ${input.taggedBy}::uuid
    from core.media_item_tags it
    where it.tenant_id = ${input.tenantId}::uuid and it.file_id = ${input.from}::uuid
      and it.status = 'active'
    on conflict (tenant_id, file_id, tag_id) where status = 'active' do nothing`);
}

/** Library items into the trash or back out of it; answers the ids changed. */
export async function trashLibraryItems(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    ids: readonly string[];
    trashed: boolean;
  },
): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.files f
    set trashed_at = case when ${input.trashed} then statement_timestamp() end
    where ${inLibrary(input.tenantId, input.orgId)} and f.id = any(${uuidArray(input.ids)})
      and (f.trashed_at is null) = ${input.trashed}
    returning f.id`);
  return rows.map((row) => row.id);
}

/**
 * Files items under tags by name, making those the school lacks, whatever
 * case they are typed in; answers the tags used.
 */
export async function tagLibraryItems(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    ids: readonly string[];
    names: readonly string[];
    taggedBy: string;
  },
): Promise<LibraryTag[]> {
  // The first spelling of a name typed twice is the one kept.
  const byKey = new Map<string, string>();
  for (const name of input.names.map((each) => each.trim()))
    if (name && !byKey.has(name.toLowerCase()))
      byKey.set(name.toLowerCase(), name);
  const names = [...byKey.values()];
  if (names.length === 0 || input.ids.length === 0) return [];
  await tx.execute(sql`
    insert into core.media_tags (tenant_id, org_id, name)
    select ${input.tenantId}::uuid, ${input.orgId}::uuid, n
    from unnest(${textArray(names)}) as n
    on conflict (tenant_id, org_id, (lower(name))) where status = 'active' do nothing`);
  const tags = await tx.execute<LibraryTag>(sql`
    select g.id, g.name from core.media_tags g
    where g.tenant_id = ${input.tenantId}::uuid and g.org_id = ${input.orgId}::uuid
      and g.status = 'active'
      and lower(g.name) = any(${textArray(names.map((name) => name.toLowerCase()))})`);
  await tx.execute(sql`
    insert into core.media_item_tags (tenant_id, file_id, tag_id, tagged_by_user_id)
    select f.tenant_id, f.id, g.id, ${input.taggedBy}::uuid
    from core.files f, core.media_tags g
    where ${inLibrary(input.tenantId, input.orgId)} and f.id = any(${uuidArray(input.ids)})
      and g.tenant_id = f.tenant_id and g.id = any(${uuidArray(tags.map((tag) => tag.id))})
    on conflict (tenant_id, file_id, tag_id) where status = 'active' do nothing`);
  return tags;
}

/** Takes library items out from under tags. */
export async function untagLibraryItems(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    ids: readonly string[];
    tagIds: readonly string[];
  },
): Promise<void> {
  if (input.ids.length === 0 || input.tagIds.length === 0) return;
  await tx.execute(sql`
    update core.media_item_tags it set status = 'tobedeleted'
    from core.files f
    where it.tenant_id = ${input.tenantId}::uuid and it.status = 'active'
      and it.file_id = any(${uuidArray(input.ids)}) and it.tag_id = any(${uuidArray(input.tagIds)})
      and f.tenant_id = it.tenant_id and f.id = it.file_id
      and ${inLibrary(input.tenantId, input.orgId)}`);
}

export async function renameMediaTag(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string; name: string },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.media_tags set name = ${input.name.trim()}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'
    returning id`);
  return rows.length > 0;
}

/** Takes a tag away from the school and off every item filed under it. */
export async function retireMediaTag(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.media_tags set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'
    returning id`);
  if (rows.length === 0) return false;
  await tx.execute(sql`
    update core.media_item_tags set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and tag_id = ${input.id}::uuid
      and status = 'active'`);
  return true;
}

/**
 * Other library items with the same bytes as each of these, by digest, so
 * whoever added one hears it was there already.
 */
export async function libraryTwins(
  tx: Tx,
  tenantId: string,
  orgId: string,
  ids: readonly string[],
): Promise<{ id: string; twinId: string; twinName: string }[]> {
  if (ids.length === 0) return [];
  return tx.execute<{ id: string; twinId: string; twinName: string }>(sql`
    select distinct on (f.id) f.id, o.id as "twinId", coalesce(x.title, o.name) as "twinName"
    from core.files f
    join core.files o on o.tenant_id = f.tenant_id and o.sha256 = f.sha256
      and o.size_bytes = f.size_bytes and o.id <> f.id and o.host_type = f.host_type
      and o.host_id = f.host_id and o.status = 'active' and o.state = 'ready'
      and o.trashed_at is null and o.id <> all(${uuidArray(ids)})
    left join core.media_item_texts x on x.tenant_id = o.tenant_id and x.file_id = o.id
      and x.status = 'active'
    where ${inLibrary(tenantId, orgId)} and f.id = any(${uuidArray(ids)})
    order by f.id, o.created_at`);
}

/** Host types whose files are a student's or a conversation's, never the library's to offer. */
const PRIVATE_HOSTS = [
  LIBRARY_AREA,
  "file_version",
  "submission",
  "submission_attempt",
  "lesson_answer",
  "message",
  "message_draft",
];

export interface DocumentUpload {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  hostType: string;
  hostId: string;
  uploadedBy: LibraryPerson | null;
}

/**
 * What staff uploaded straight into the documents they wrote, newest
 * first, that the library does not hold yet: one row per stored object,
 * so a picture copied into several records is offered once. Students'
 * work and conversations are never among them; the caller still checks
 * that the viewer may open each.
 */
export async function documentUploads(
  tx: Tx,
  input: { tenantId: string; orgId: string; q: string; limit: number },
): Promise<DocumentUpload[]> {
  const rows = await tx.execute<{
    id: string;
    name: string;
    media_type: string;
    size_bytes: string | number;
    created_at: string;
    host_type: string;
    host_id: string;
    uploaded_by_user_id: string | null;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select * from (
      select distinct on (f.storage_key) f.id, f.name, f.media_type, f.size_bytes,
        ${isoOf(sql`f.created_at`)} as created_at, f.created_at as added, f.host_type, f.host_id,
        f.uploaded_by_user_id, u.full_name_en, u.full_name_ar
      from core.files f
      left join core.users u on u.tenant_id = f.tenant_id and u.id = f.uploaded_by_user_id
      where f.tenant_id = ${input.tenantId}::uuid and f.org_id = ${input.orgId}::uuid
        and f.purpose = 'document_media' and f.status = 'active' and f.state = 'ready'
        and f.trashed_at is null and f.host_type is not null
        and f.host_type <> all(${textArray(PRIVATE_HOSTS)})
        and not (f.metadata ? 'trim')
        and (${holds(input.q, [sql`f.name`])})
        and exists (
          select 1 from core.document_files l
          where l.tenant_id = f.tenant_id and l.file_id = f.id and l.status = 'active')
        and exists (
          select 1 from core.user_roles r
          where r.tenant_id = f.tenant_id and r.user_id = f.uploaded_by_user_id
            and r.org_id = f.org_id and r.status = 'active'
            and r.role = any(app.staff_roles()))
        and not exists (
          select 1 from core.files k
          where k.tenant_id = f.tenant_id and k.host_type = ${LIBRARY_AREA}
            and k.host_id = f.org_id and k.status = 'active'
            and (k.storage_key = f.storage_key or k.metadata->>'copiedFrom' = f.id::text))
      order by f.storage_key, f.created_at desc) found
    order by added desc, id
    limit ${input.limit}`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
    hostType: row.host_type,
    hostId: row.host_id,
    uploadedBy: row.uploaded_by_user_id
      ? {
          id: row.uploaded_by_user_id,
          fullNameEn: row.full_name_en,
          fullNameAr: row.full_name_ar,
        }
      : null,
  }));
}

export interface StorageShare {
  usedBytes: number;
  fileCount: number;
}

const share = (row: {
  used_bytes: string | number;
  file_count: number;
}): StorageShare => ({
  usedBytes: Number(row.used_bytes),
  fileCount: row.file_count,
});

export interface SchoolStorageBreakdown {
  kinds: (StorageShare & { kind: FileKind })[];
  /** Staff by what they uploaded, the most first. */
  staff: (StorageShare & LibraryPerson)[];
  /** What students, families and the school's inbound mail brought in. */
  others: StorageShare;
}

/**
 * Where a school's storage goes, by kind of file and by who uploaded it,
 * each stored object counted once and to whoever first uploaded it, as
 * the pool counts it. A video's streams count with it, once per folder.
 */
export async function schoolStorageBreakdown(
  tx: Tx,
  tenantId: string,
  orgId: string,
): Promise<SchoolStorageBreakdown> {
  const held = sql`core.files f
    where f.tenant_id = ${tenantId}::uuid and f.org_id = ${orgId}::uuid and f.status = 'active'
      and f.state in ('initiated', 'quarantined', 'ready')`;
  const objects = sql`(
    (select distinct on (f.storage_key) f.size_bytes, f.uploaded_by_user_id,
      ${kindOfFile} as kind, 1 as object
    from ${held}
    order by f.storage_key, f.created_at)
    union all
    (select distinct on (f.derivatives -> 'hls' ->> 'key') f.stream_bytes,
      f.uploaded_by_user_id, ${kindOfFile}, 0
    from ${held} and f.derivatives ? 'hls' and f.stream_bytes is not null
    order by f.derivatives -> 'hls' ->> 'key', f.created_at)) objects`;
  const [kinds, people] = await Promise.all([
    tx.execute<{
      kind: FileKind;
      used_bytes: string | number;
      file_count: number;
    }>(sql`
      select kind, coalesce(sum(size_bytes), 0) as used_bytes, sum(object)::int as file_count
      from ${objects} group by kind order by 2 desc`),
    tx.execute<{
      user_id: string | null;
      full_name_en: string | null;
      full_name_ar: string | null;
      used_bytes: string | number;
      file_count: number;
    }>(sql`
      with staff as (
        select distinct r.user_id from core.user_roles r
        where r.tenant_id = ${tenantId}::uuid and r.org_id = ${orgId}::uuid
          and r.status = 'active' and r.role = any(app.staff_roles())),
      counted as (
        select case when uploaded_by_user_id in (select user_id from staff)
            then uploaded_by_user_id end as user_id,
          sum(size_bytes) as used_bytes, sum(object)::int as file_count
        from ${objects} group by 1)
      select c.user_id, u.full_name_en, u.full_name_ar, c.used_bytes, c.file_count
      from counted c
      left join core.users u on u.tenant_id = ${tenantId}::uuid and u.id = c.user_id
      order by c.used_bytes desc`),
  ]);
  const others = people.find((row) => row.user_id === null);
  return {
    kinds: kinds.map((row) => ({ kind: row.kind, ...share(row) })),
    staff: people
      .filter((row) => row.user_id !== null)
      .slice(0, 10)
      .map((row) => ({
        id: row.user_id ?? "",
        fullNameEn: row.full_name_en,
        fullNameAr: row.full_name_ar,
        ...share(row),
      })),
    others: others ? share(others) : { usedBytes: 0, fileCount: 0 },
  };
}

/**
 * Sets where a library picture's subject sits, or clears it; crops start
 * from it and the website keeps it in view wherever it shows the picture.
 */
export async function setLibraryFocus(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    focus: PictureFocus | null;
  },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.files f
    set metadata = case when ${input.focus === null}
      then f.metadata - 'focus'
      else f.metadata || jsonb_build_object('focus', ${input.focus}::jsonb) end
    where ${inLibrary(input.tenantId, input.orgId)} and f.id = ${input.id}::uuid
      and f.media_type like 'image/%'
    returning f.id`);
  return rows.length > 0;
}
