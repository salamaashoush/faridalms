import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

/** The grade levels each programme covers. */
export async function levelsOfProgrammes(
  tx: Tx,
  input: { tenantId: string; programmeIds: readonly string[] },
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (input.programmeIds.length === 0) return result;
  const rows = await tx.execute<{ programme_id: string; grade_id: string }>(sql`
    select programme_id, grade_level_descriptor_id as grade_id from core.programme_grade_levels
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and programme_id = any(${uuidArray(input.programmeIds)})
    order by created_at, id`);
  for (const row of rows)
    result.set(row.programme_id, [
      ...(result.get(row.programme_id) ?? []),
      row.grade_id,
    ]);
  return result;
}

/** Replaces the grade levels a programme covers. */
export async function setProgrammeLevels(
  tx: Tx,
  input: { tenantId: string; programmeId: string; gradeIds: readonly string[] },
) {
  await tx.execute(sql`
    update core.programme_grade_levels set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and programme_id = ${input.programmeId}::uuid
      and status = 'active'
      and not (grade_level_descriptor_id = any(${uuidArray(input.gradeIds)}))`);
  if (input.gradeIds.length)
    await tx.execute(sql`
      insert into core.programme_grade_levels (tenant_id, programme_id, grade_level_descriptor_id)
      select ${input.tenantId}::uuid, ${input.programmeId}::uuid, level
      from unnest(${uuidArray([...new Set(input.gradeIds)])}) as level
      where not exists (select 1 from core.programme_grade_levels l
        where l.tenant_id = ${input.tenantId}::uuid and l.programme_id = ${input.programmeId}::uuid
          and l.grade_level_descriptor_id = level and l.status = 'active')`);
}

/** The school's active programmes covering each grade level. */
export async function programmesByLevel(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<Map<string, string[]>> {
  const rows = await tx.execute<{ grade_id: string; programme_id: string }>(sql`
    select l.grade_level_descriptor_id as grade_id, l.programme_id
    from core.programme_grade_levels l
    join core.programmes p on p.tenant_id = l.tenant_id and p.id = l.programme_id
      and p.status = 'active' and p.org_id = ${input.orgId}::uuid
    where l.tenant_id = ${input.tenantId}::uuid and l.status = 'active'`);
  const result = new Map<string, string[]>();
  for (const row of rows)
    result.set(row.grade_id, [
      ...(result.get(row.grade_id) ?? []),
      row.programme_id,
    ]);
  return result;
}
