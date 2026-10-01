import type { GradeBand, GradeDisplay } from "@faridalms/domain/grading";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface ScaleVersionRow {
  id: string;
  scaleId: string;
  bands: GradeBand[];
  display: GradeDisplay;
}

/** The bands and display of the scale versions that grades were given under. */
export async function scaleVersionsOf(
  tx: Tx,
  tenantId: string,
  ids: readonly string[],
): Promise<ScaleVersionRow[]> {
  if (!ids.length) return [];
  const rows = await tx.execute<{
    id: string;
    scale_id: string;
    bands: GradeBand[];
    display: GradeDisplay;
  }>(sql`
    select v.id, v.scale_id, v.bands, s.display
    from core.grade_scale_versions v
    join core.grade_scales s on s.tenant_id = v.tenant_id and s.id = v.scale_id
    where v.tenant_id = ${tenantId}::uuid and v.id = any(${uuidArray(ids)})`);
  return rows.map((row) => ({
    id: row.id,
    scaleId: row.scale_id,
    bands: row.bands,
    display: row.display,
  }));
}

export interface ScaleRow {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
  display: GradeDisplay;
  versions: {
    id: string;
    effectiveFrom: string;
    bands: GradeBand[];
    reason: string | null;
  }[];
}

/** A school's scales, each with its versions newest first. */
export async function scalesOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<ScaleRow[]> {
  const rows = await tx.execute<{
    id: string;
    title_en: string | null;
    title_ar: string | null;
    display: GradeDisplay;
    versions: {
      id: string;
      effectiveFrom: string;
      bands: GradeBand[];
      reason: string | null;
    }[];
  }>(sql`
    select s.id, s.title_en, s.title_ar, s.display,
      coalesce((select jsonb_agg(jsonb_build_object('id', v.id,
          'effectiveFrom', v.effective_from::text, 'bands', v.bands, 'reason', v.reason)
          order by v.effective_from desc)
        from core.grade_scale_versions v
        where v.tenant_id = s.tenant_id and v.scale_id = s.id and v.status = 'active'),
        '[]'::jsonb) as versions
    from core.grade_scales s
    where s.tenant_id = ${input.tenantId}::uuid and s.org_id = ${input.orgId}::uuid
      and s.status = 'active'
    order by lower(coalesce(s.title_en, s.title_ar)), s.id`);
  return rows.map((row) => ({
    id: row.id,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    display: row.display,
    versions: row.versions,
  }));
}

export async function saveScale(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id?: string;
    titleEn: string | null;
    titleAr: string | null;
    display: GradeDisplay;
  },
): Promise<{ id: string } | null> {
  const [row] = input.id
    ? await tx.execute<{ id: string }>(sql`
        update core.grade_scales set title_en = ${input.titleEn}, title_ar = ${input.titleAr},
          display = ${input.display}
        where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
          and id = ${input.id}::uuid and status = 'active'
        returning id`)
    : await tx.execute<{ id: string }>(sql`
        insert into core.grade_scales (tenant_id, org_id, title_en, title_ar, display)
        values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.titleEn},
          ${input.titleAr}, ${input.display})
        returning id`);
  return row ?? null;
}

export async function insertScaleVersion(
  tx: Tx,
  input: {
    tenantId: string;
    scaleId: string;
    effectiveFrom: string;
    bands: GradeBand[];
    reason: string | null;
    userId: string;
  },
): Promise<{ id: string }> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.grade_scale_versions (tenant_id, scale_id, effective_from, bands, reason,
      created_by_user_id)
    values (${input.tenantId}::uuid, ${input.scaleId}::uuid, ${input.effectiveFrom}::date,
      ${JSON.stringify(input.bands)}::text::jsonb, ${input.reason}, ${input.userId}::uuid)
    returning id`);
  if (!row) throw new Error("scale version not written");
  return row;
}

/** Whether classes or programmes still grade on a scale. */
export async function scaleInUse(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ used: boolean }>(sql`
    select exists (select 1 from core.classes where tenant_id = ${input.tenantId}::uuid
        and grade_scale_id = ${input.id}::uuid and status = 'active')
      or exists (select 1 from core.programmes where tenant_id = ${input.tenantId}::uuid
        and grade_scale_id = ${input.id}::uuid and status = 'active') as used`);
  return row?.used ?? false;
}

export async function retireScale(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.grade_scales set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'
    returning id`);
  return rows.length > 0;
}

export interface ProgrammeRow {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
  gradeLevelIds: string[];
  scaleId: string | null;
  officialBoard: string | null;
  boardId: string | null;
  classes: number;
}

export async function programmesOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<ProgrammeRow[]> {
  const rows = await tx.execute<{
    id: string;
    title_en: string | null;
    title_ar: string | null;
    grade_level_ids: string[];
    grade_scale_id: string | null;
    official_board: string | null;
    board_id: string | null;
    classes: number;
  }>(sql`
    select p.id, p.title_en, p.title_ar, p.grade_scale_id, p.official_board, p.board_id,
      coalesce(array(select l.grade_level_descriptor_id::text from core.programme_grade_levels l
        where l.tenant_id = p.tenant_id and l.programme_id = p.id and l.status = 'active'),
        '{}') as grade_level_ids,
      (select count(*)::int from core.classes c where c.tenant_id = p.tenant_id
        and c.org_id = p.org_id and c.status = 'active' and app.programme_of(c.id) = p.id) as classes
    from core.programmes p
    where p.tenant_id = ${input.tenantId}::uuid and p.org_id = ${input.orgId}::uuid
      and p.status = 'active'
    order by lower(coalesce(p.title_en, p.title_ar)), p.id`);
  return rows.map((row) => ({
    id: row.id,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    gradeLevelIds: row.grade_level_ids,
    scaleId: row.grade_scale_id,
    officialBoard: row.official_board,
    boardId: row.board_id,
    classes: row.classes,
  }));
}

export async function saveProgramme(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id?: string;
    titleEn: string | null;
    titleAr: string | null;
    gradeLevelIds: readonly string[];
    scaleId: string | null;
    officialBoard: string | null;
    boardId: string | null;
  },
): Promise<{ id: string } | null> {
  const [row] = input.id
    ? await tx.execute<{ id: string }>(sql`
        update core.programmes set title_en = ${input.titleEn}, title_ar = ${input.titleAr},
          grade_scale_id = ${input.scaleId}::uuid, official_board = ${input.officialBoard},
          board_id = ${input.boardId}::uuid
        where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
          and id = ${input.id}::uuid and status = 'active'
        returning id`)
    : await tx.execute<{ id: string }>(sql`
        insert into core.programmes (tenant_id, org_id, title_en, title_ar, grade_scale_id,
          official_board, board_id)
        values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.titleEn},
          ${input.titleAr}, ${input.scaleId}::uuid, ${input.officialBoard}, ${input.boardId}::uuid)
        returning id`);
  if (!row) return null;
  await tx.execute(sql`
    update core.programme_grade_levels set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and programme_id = ${row.id}::uuid
      and status = 'active'
      and not (grade_level_descriptor_id = any(${uuidArray(input.gradeLevelIds)}))`);
  if (input.gradeLevelIds.length)
    await tx.execute(sql`
      insert into core.programme_grade_levels (tenant_id, programme_id, grade_level_descriptor_id)
      select ${input.tenantId}::uuid, ${row.id}::uuid, level
      from unnest(${uuidArray(input.gradeLevelIds)}) as level
      where not exists (select 1 from core.programme_grade_levels l
        where l.tenant_id = ${input.tenantId}::uuid and l.programme_id = ${row.id}::uuid
          and l.grade_level_descriptor_id = level and l.status = 'active')`);
  return row;
}

/** Whether classes name a programme as their own. */
export async function programmeInUse(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ used: boolean }>(sql`
    select exists (select 1 from core.classes where tenant_id = ${input.tenantId}::uuid
      and programme_id = ${input.id}::uuid and status = 'active') as used`);
  return row?.used ?? false;
}

export async function retireProgramme(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.programmes set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'
    returning id`);
  if (rows.length)
    await tx.execute(sql`
      update core.programme_grade_levels set status = 'tobedeleted'
      where tenant_id = ${input.tenantId}::uuid and programme_id = ${input.id}::uuid
        and status = 'active'`);
  return rows.length > 0;
}

export interface ClassGrading {
  programmeId: string | null;
  scaleId: string | null;
  /** The programme the class follows: its own, else the one covering its grade level. */
  effectiveProgrammeId: string | null;
  /** The scale version it grades on today. */
  versionId: string | null;
}

export async function classGrading(
  tx: Tx,
  input: { tenantId: string; classId: string; today: string },
): Promise<ClassGrading | null> {
  const [row] = await tx.execute<{
    programme_id: string | null;
    grade_scale_id: string | null;
    effective_programme_id: string | null;
    version_id: string | null;
  }>(sql`
    select programme_id, grade_scale_id, app.programme_of(id) as effective_programme_id,
      app.scale_version_of(id, ${input.today}::date) as version_id
    from core.classes
    where tenant_id = ${input.tenantId}::uuid and id = ${input.classId}::uuid and status = 'active'`);
  return row
    ? {
        programmeId: row.programme_id,
        scaleId: row.grade_scale_id,
        effectiveProgrammeId: row.effective_programme_id,
        versionId: row.version_id,
      }
    : null;
}

export async function setClassGrading(
  tx: Tx,
  input: {
    tenantId: string;
    classId: string;
    programmeId: string | null;
    scaleId: string | null;
  },
): Promise<void> {
  await tx.execute(sql`
    update core.classes set programme_id = ${input.programmeId}::uuid,
      grade_scale_id = ${input.scaleId}::uuid
    where tenant_id = ${input.tenantId}::uuid and id = ${input.classId}::uuid and status = 'active'`);
}

/**
 * Grades a term's work again on the bands in force today: its term grades
 * and the scores of the work set for it. Only what has a score changes.
 */
export async function regradeTerm(
  tx: Tx,
  input: { tenantId: string; orgId: string; periodId: string; today: string },
): Promise<{ terms: number; work: number }> {
  const terms = await tx.execute<{ id: string }>(sql`
    update core.period_grades g
    set grade_scale_version_id = app.scale_version_of(g.class_id, ${input.today}::date)
    where g.tenant_id = ${input.tenantId}::uuid and g.org_id = ${input.orgId}::uuid
      and g.grading_period_id = ${input.periodId}::uuid and g.status = 'active'
      and g.score is not null
    returning g.id`);
  const work = await tx.execute<{ id: string }>(sql`
    update core.assessments x
    set grade_scale_version_id = app.scale_version_of(a.class_id, ${input.today}::date)
    from core.submissions s
    join core.assignments a on a.tenant_id = s.tenant_id and a.id = s.assignment_id
    where x.tenant_id = ${input.tenantId}::uuid and s.tenant_id = x.tenant_id
      and s.id = x.submission_id and a.org_id = ${input.orgId}::uuid
      and a.grading_period_id = ${input.periodId}::uuid and x.status = 'active'
      and x.score is not null
    returning x.id`);
  return { terms: terms.length, work: work.length };
}
