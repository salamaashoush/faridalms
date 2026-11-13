import type { PublishedPicture } from "@faridalms/domain/previews";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

/** What a school wrote for one class on its website. */
export interface SiteClassRow {
  id: string;
  version: number;
  classId: string;
  shown: boolean;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  levelEn: string;
  levelAr: string;
  pictureFileId: string | null;
  pictureAltEn: string;
  pictureAltAr: string;
}

type Written = Omit<SiteClassRow, "id" | "version" | "classId">;

export async function siteClassOf(
  tx: Tx,
  input: { tenantId: string; classId: string },
): Promise<SiteClassRow | null> {
  const [row] = await tx.execute<{
    id: string;
    version: number;
    class_id: string;
    shown: boolean;
    title_en: string;
    title_ar: string;
    description_en: string;
    description_ar: string;
    level_en: string;
    level_ar: string;
    picture_file_id: string | null;
    picture_alt_en: string;
    picture_alt_ar: string;
  }>(sql`
    select id, version, class_id, shown, title_en, title_ar, description_en, description_ar,
      level_en, level_ar, picture_file_id, picture_alt_en, picture_alt_ar
    from core.site_classes
    where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid
      and status = 'active'`);
  return row
    ? {
        id: row.id,
        version: row.version,
        classId: row.class_id,
        shown: row.shown,
        titleEn: row.title_en,
        titleAr: row.title_ar,
        descriptionEn: row.description_en,
        descriptionAr: row.description_ar,
        levelEn: row.level_en,
        levelAr: row.level_ar,
        pictureFileId: row.picture_file_id,
        pictureAltEn: row.picture_alt_en,
        pictureAltAr: row.picture_alt_ar,
      }
    : null;
}

/**
 * Keeps what the school wrote for a class, from the version it read: 0 for
 * a class it had written nothing for. Null when another change came first.
 */
export async function saveSiteClass(
  tx: Tx,
  input: Written & {
    tenantId: string;
    orgId: string;
    classId: string;
    expectedVersion: number;
    pictureKey: string | null;
    picture: PublishedPicture | null;
  },
): Promise<{ version: number } | null> {
  const values = sql`${input.shown}, ${input.titleEn}, ${input.titleAr},
    ${input.descriptionEn}, ${input.descriptionAr}, ${input.levelEn}, ${input.levelAr},
    ${input.pictureFileId}::uuid, ${input.pictureAltEn}, ${input.pictureAltAr},
    ${input.pictureKey}, ${input.picture ? JSON.stringify(input.picture) : null}::jsonb`;
  if (input.expectedVersion === 0) {
    const [created] = await tx.execute<{ version: number }>(sql`
      insert into core.site_classes (tenant_id, org_id, class_id, shown, title_en, title_ar,
        description_en, description_ar, level_en, level_ar, picture_file_id, picture_alt_en,
        picture_alt_ar, picture_key, picture)
      select ${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.classId}::uuid, ${values}
      where not exists (select 1 from core.site_classes
        where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid
          and status = 'active')
      returning version`);
    return created ?? null;
  }
  const [saved] = await tx.execute<{ version: number }>(sql`
    update core.site_classes
    set (shown, title_en, title_ar, description_en, description_ar, level_en, level_ar,
        picture_file_id, picture_alt_en, picture_alt_ar, picture_key, picture) = (${values})
    where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid
      and org_id = ${input.orgId}::uuid and status = 'active'
      and version = ${input.expectedVersion}
    returning version`);
  return saved ?? null;
}

/** A class the builder may list on the website: still running or yet to start. */
export interface SiteClassChoice {
  id: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  courseId: string | null;
  shown: boolean;
}

export async function siteClassChoices(
  tx: Tx,
  input: { tenantId: string; orgId: string; today: string },
): Promise<SiteClassChoice[]> {
  const rows = await tx.execute<{
    id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
    course_id: string | null;
    shown: boolean;
  }>(sql`
    select c.id, c.code, c.title_en, c.title_ar, c.course_id, coalesce(s.shown, false) as shown
    from core.classes c
    left join core.site_classes s on s.tenant_id = c.tenant_id and s.class_id = c.id
      and s.status = 'active'
    where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.orgId}::uuid
      and c.status = 'active'
      and (upper_inf(c.runs) or upper(c.runs) > ${input.today}::date)
    order by lower(c.runs), coalesce(c.title_en, c.title_ar), c.id`);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    courseId: row.course_id,
    shown: row.shown,
  }));
}

/** The school's courses, for a section that lists the classes of one. */
export async function siteCourses(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<{ id: string; titleEn: string | null; titleAr: string | null }[]> {
  const rows = await tx.execute<{
    id: string;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    select id, title_en, title_ar from core.courses
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'
    order by coalesce(title_en, title_ar), id`);
  return rows.map((row) => ({
    id: row.id,
    titleEn: row.title_en,
    titleAr: row.title_ar,
  }));
}

/** A class the school shows on its website, as a visitor may read it, in both languages. */
export interface PublicClassRow {
  classId: string;
  titleEn: string | null;
  titleAr: string | null;
  descriptionEn: string;
  descriptionAr: string;
  levelEn: string;
  levelAr: string;
  pictureKey: string | null;
  picture: PublishedPicture | null;
  pictureAltEn: string;
  pictureAltAr: string;
  startsOn: string;
  endsOn: string | null;
  courseId: string | null;
  teachersEn: string[];
  teachersAr: string[];
}

/** The classes a school shows on its website that have not ended, soonest first. */
export async function publicSiteClasses(
  tx: Tx,
  input: { orgId: string; today: string },
): Promise<PublicClassRow[]> {
  const rows = await tx.execute<{
    class_id: string;
    title_en: string | null;
    title_ar: string | null;
    description_en: string;
    description_ar: string;
    level_en: string;
    level_ar: string;
    picture_key: string | null;
    picture: PublishedPicture | null;
    picture_alt_en: string;
    picture_alt_ar: string;
    starts_on: string;
    ends_on: string | null;
    course_id: string | null;
    teachers_en: string[];
    teachers_ar: string[];
  }>(sql`
    select class_id, title_en, title_ar, description_en, description_ar, level_en, level_ar,
      picture_key, picture, picture_alt_en, picture_alt_ar,
      to_char(starts_on, 'YYYY-MM-DD') as starts_on, to_char(ends_on, 'YYYY-MM-DD') as ends_on,
      course_id, teachers_en, teachers_ar
    from app.site_classes(${input.orgId}::uuid, ${input.today}::date)`);
  return rows.map((row) => ({
    classId: row.class_id,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    descriptionEn: row.description_en,
    descriptionAr: row.description_ar,
    levelEn: row.level_en,
    levelAr: row.level_ar,
    pictureKey: row.picture_key,
    picture: row.picture,
    pictureAltEn: row.picture_alt_en,
    pictureAltAr: row.picture_alt_ar,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    courseId: row.course_id,
    teachersEn: row.teachers_en,
    teachersAr: row.teachers_ar,
  }));
}

/** Adds a picture's sizes, made after the class was shown, to what visitors read. */
export async function keepSiteClassPicture(
  tx: Tx,
  input: {
    tenantId: string;
    hostId: string;
    fileId: string;
    picture: PublishedPicture;
  },
): Promise<number> {
  const rows = await tx.execute(sql`
    update core.site_classes
    set picture = ${JSON.stringify(input.picture)}::jsonb
    where tenant_id = ${input.tenantId}::uuid and class_id = ${input.hostId}::uuid
      and status = 'active' and picture_file_id = ${input.fileId}::uuid
      and picture_key is not null
    returning 1`);
  return rows.length;
}
