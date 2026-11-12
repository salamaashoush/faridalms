import type { GradeBand, GradeDisplay } from "@faridalms/domain/grading";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { isoOf, uuidArray } from "./sql";

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
  classes: number;
  categories: CategoryRow[];
}

export interface CategoryRow {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
  weight: number;
}

const categoriesOf = sql`coalesce((select jsonb_agg(jsonb_build_object('id', k.id,
    'titleEn', k.title_en, 'titleAr', k.title_ar, 'weight', k.weight)
    order by k.position, k.id)
  from core.programme_categories k
  where k.tenant_id = p.tenant_id and k.programme_id = p.id and k.status = 'active'),
  '[]'::jsonb)`;

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
    classes: number;
    categories: CategoryRow[];
  }>(sql`
    select p.id, p.title_en, p.title_ar, p.grade_scale_id,
      ${categoriesOf} as categories,
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
    classes: row.classes,
    categories: row.categories,
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
    categories: readonly {
      id?: string;
      titleEn: string | null;
      titleAr: string | null;
      weight: number;
    }[];
  },
): Promise<{ id: string } | null> {
  const [row] = input.id
    ? await tx.execute<{ id: string }>(sql`
        update core.programmes set title_en = ${input.titleEn}, title_ar = ${input.titleAr},
          grade_scale_id = ${input.scaleId}::uuid
        where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
          and id = ${input.id}::uuid and status = 'active'
        returning id`)
    : await tx.execute<{ id: string }>(sql`
        insert into core.programmes (tenant_id, org_id, title_en, title_ar, grade_scale_id)
        values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.titleEn},
          ${input.titleAr}, ${input.scaleId}::uuid)
        returning id`);
  if (!row) return null;
  await tx.execute(sql`
    update core.programme_grade_levels set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and programme_id = ${row.id}::uuid
      and status = 'active'
      and not (grade_level_descriptor_id = any(${uuidArray(input.gradeLevelIds)}))`);
  await saveCategories(tx, {
    tenantId: input.tenantId,
    programmeId: row.id,
    categories: input.categories,
  });
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

/**
 * Replaces a programme's categories with those given: kept ones by id, new
 * ones added, and missing ones retired. Work set in a retired category
 * keeps pointing at it and stops counting toward a weight.
 */
async function saveCategories(
  tx: Tx,
  input: {
    tenantId: string;
    programmeId: string;
    categories: readonly {
      id?: string;
      titleEn: string | null;
      titleAr: string | null;
      weight: number;
    }[];
  },
) {
  const kept = input.categories.flatMap((row) => (row.id ? [row.id] : []));
  await tx.execute(sql`
    update core.programme_categories set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and programme_id = ${input.programmeId}::uuid
      and status = 'active' and not (id = any(${uuidArray(kept)}))`);
  await Promise.all(
    input.categories.map(async (row, position) => {
      const changed = row.id
        ? await tx.execute<{ id: string }>(sql`
            update core.programme_categories set title_en = ${row.titleEn},
              title_ar = ${row.titleAr}, weight = ${row.weight}, position = ${position}
            where tenant_id = ${input.tenantId}::uuid and id = ${row.id}::uuid
              and programme_id = ${input.programmeId}::uuid and status = 'active'
            returning id`)
        : [];
      if (changed.length) return;
      await tx.execute(sql`
        insert into core.programme_categories (tenant_id, programme_id, title_en, title_ar,
          weight, position)
        values (${input.tenantId}::uuid, ${input.programmeId}::uuid, ${row.titleEn},
          ${row.titleAr}, ${row.weight}, ${position})`);
    }),
  );
}

/** The categories work in a class may count in: its programme's. */
export async function classCategories(
  tx: Tx,
  input: { tenantId: string; classId: string },
): Promise<CategoryRow[]> {
  const rows = await tx.execute<{
    id: string;
    title_en: string | null;
    title_ar: string | null;
    weight: string;
  }>(sql`
    select k.id, k.title_en, k.title_ar, k.weight::text as weight
    from core.programme_categories k
    where k.tenant_id = ${input.tenantId}::uuid and k.status = 'active'
      and k.programme_id = app.programme_of(${input.classId}::uuid)
    order by k.position, k.id`);
  return rows.map((row) => ({
    id: row.id,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    weight: Number(row.weight),
  }));
}

export interface GradingChange {
  id: string;
  occurredAt: string;
  action: string;
  objectId: string | null;
  actorEn: string | null;
  actorAr: string | null;
  reason: string | null;
  /** The name the change gave a scale or programme, where it named one. */
  titleEn: string | null;
  titleAr: string | null;
}

/** A page of the changes made to the school's scales, programmes and classes' grading, newest first. */
export async function gradingChanges(
  tx: Tx,
  input: { tenantId: string; orgId: string; limit: number; offset: number },
): Promise<{ rows: GradingChange[]; total: number }> {
  const rows = await tx.execute<{
    id: string;
    occurred_at: string;
    action: string;
    object_id: string | null;
    actor_en: string | null;
    actor_ar: string | null;
    reason: string | null;
    title_en: string | null;
    title_ar: string | null;
    total: number;
  }>(sql`
    select l.id, ${isoOf(sql`l.occurred_at`)} as occurred_at, l.action, l.object_id,
           a.full_name_en as actor_en, a.full_name_ar as actor_ar,
           l.details ->> 'reason' as reason, l.details -> 'after' ->> 'titleEn' as title_en,
           l.details -> 'after' ->> 'titleAr' as title_ar,
           count(*) over ()::int as total
    from audit.log l
    left join core.users a on a.tenant_id = l.tenant_id and a.id = l.actor_user_id
    where l.tenant_id = ${input.tenantId}::uuid and l.org_id = ${input.orgId}::uuid
      and l.outcome = 'success' and l.action like 'grading\\_%'
    order by l.occurred_at desc, l.id desc
    limit ${input.limit} offset ${input.offset}`);
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      action: row.action,
      objectId: row.object_id,
      actorEn: row.actor_en,
      actorAr: row.actor_ar,
      reason: row.reason,
      titleEn: row.title_en,
      titleAr: row.title_ar,
    })),
  };
}
