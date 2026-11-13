import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

/** The grade each class teaches, of those given that have one. */
export async function gradesOfClasses(
  tx: Tx,
  tenantId: string,
  classIds: readonly string[],
): Promise<Map<string, string>> {
  if (classIds.length === 0) return new Map();
  const rows = await tx.execute<{ class_id: string; grade_id: string }>(sql`
    select class_id, grade_level_descriptor_id as grade_id from core.class_grades
    where tenant_id = ${tenantId}::uuid and class_id = any(${uuidArray(classIds)})
      and status = 'active'`);
  return new Map(rows.map((row) => [row.class_id, row.grade_id]));
}

/** Gives the classes a grade, or none, in place of what they had. */
export async function setClassGrade(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    classIds: readonly string[];
    gradeId: string | null;
  },
) {
  if (input.classIds.length === 0) return;
  await tx.execute(sql`
    update core.class_grades set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and class_id = any(${uuidArray(input.classIds)})
      and status = 'active'
      and grade_level_descriptor_id is distinct from ${input.gradeId}::uuid`);
  if (input.gradeId)
    await tx.execute(sql`
      insert into core.class_grades (tenant_id, org_id, class_id, grade_level_descriptor_id)
      select c.tenant_id, c.org_id, c.id, ${input.gradeId}::uuid
      from core.classes c
      where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.orgId}::uuid
        and c.id = any(${uuidArray(input.classIds)})
        and not exists (select 1 from core.class_grades g where g.tenant_id = c.tenant_id
          and g.class_id = c.id and g.status = 'active')`);
}

/** The school's classes of the grades, active ones only. */
export async function classesOfGrades(
  tx: Tx,
  input: { tenantId: string; orgId: string; gradeIds: readonly string[] },
): Promise<string[]> {
  if (input.gradeIds.length === 0) return [];
  const rows = await tx.execute<{ class_id: string }>(sql`
    select g.class_id from core.class_grades g
    join core.classes c on c.tenant_id = g.tenant_id and c.id = g.class_id and c.status = 'active'
    where g.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.orgId}::uuid
      and g.status = 'active' and g.grade_level_descriptor_id = any(${uuidArray(input.gradeIds)})`);
  return rows.map((row) => row.class_id);
}

/** The grades the classes running on the day teach, in the school's order. */
export async function gradesRunning(
  tx: Tx,
  input: { tenantId: string; orgId: string; on: string },
): Promise<string[]> {
  const rows = await tx.execute<{ grade_id: string }>(sql`
    select distinct g.grade_level_descriptor_id as grade_id from core.class_grades g
    join core.classes c on c.tenant_id = g.tenant_id and c.id = g.class_id
    where g.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.orgId}::uuid
      and g.status = 'active' and c.status = 'active' and c.runs @> ${input.on}::date`);
  return rows.map((row) => row.grade_id);
}

/** How many of the school's classes running on or after a day teach each grade. */
export async function classesHolding(
  tx: Tx,
  input: { tenantId: string; orgId: string; from: string },
): Promise<Map<string, number>> {
  const rows = await tx.execute<{ grade_id: string; n: number }>(sql`
    select g.grade_level_descriptor_id as grade_id, count(*)::int as n from core.class_grades g
    join core.classes c on c.tenant_id = g.tenant_id and c.id = g.class_id
    where g.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.orgId}::uuid
      and g.status = 'active' and c.status = 'active'
      and (upper_inf(c.runs) or upper(c.runs) > ${input.from}::date)
    group by g.grade_level_descriptor_id`);
  return new Map(rows.map((row) => [row.grade_id, row.n]));
}
