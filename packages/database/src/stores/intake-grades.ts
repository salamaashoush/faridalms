import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface IntakeGrade {
  gradeId: string;
  meaning: string | null;
  labelEn: string | null;
  labelAr: string | null;
  sortOrder: number;
}

/** The grade each intake admits into, as its school labels it, of those that name one. */
export async function gradesOfIntakes(
  tx: Tx,
  input: { tenantId: string; intakeIds: readonly string[] },
): Promise<Map<string, IntakeGrade>> {
  if (input.intakeIds.length === 0) return new Map();
  const rows = await tx.execute<{
    intake_id: string;
    grade_id: string;
    meaning: string | null;
    label_en: string | null;
    label_ar: string | null;
    sort_order: number;
  }>(sql`
    select l.intake_id, g.id as grade_id, g.system_meaning as meaning,
      coalesce(o.label_en, g.label_en) as label_en, coalesce(o.label_ar, g.label_ar) as label_ar,
      coalesce(o.sort_order, g.sort_order) as sort_order
    from core.intake_grades l
    join core.admission_intakes i on i.tenant_id = l.tenant_id and i.id = l.intake_id
    join core.descriptors g on g.tenant_id = l.tenant_id and g.id = l.grade_level_descriptor_id
    left join lateral (
      select x.label_en, x.label_ar, x.sort_order from core.descriptor_overrides x
      where x.tenant_id = l.tenant_id and x.descriptor_id = g.id and x.org_id = i.org_id
        and x.status = 'active' limit 1
    ) o on true
    where l.tenant_id = ${input.tenantId}::uuid and l.status = 'active'
      and l.intake_id = any(${uuidArray(input.intakeIds)})`);
  return new Map(
    rows.map((row) => [
      row.intake_id,
      {
        gradeId: row.grade_id,
        meaning: row.meaning,
        labelEn: row.label_en,
        labelAr: row.label_ar,
        sortOrder: row.sort_order,
      },
    ]),
  );
}

/** Names the grade an intake admits into, or none. */
export async function setIntakeGrade(
  tx: Tx,
  input: { tenantId: string; intakeId: string; gradeId: string | null },
) {
  await tx.execute(sql`
    update core.intake_grades set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and intake_id = ${input.intakeId}::uuid
      and status = 'active' and grade_level_descriptor_id is distinct from ${input.gradeId}::uuid`);
  if (input.gradeId)
    await tx.execute(sql`
      insert into core.intake_grades (tenant_id, intake_id, grade_level_descriptor_id)
      select ${input.tenantId}::uuid, ${input.intakeId}::uuid, ${input.gradeId}::uuid
      where not exists (select 1 from core.intake_grades where tenant_id = ${input.tenantId}::uuid
        and intake_id = ${input.intakeId}::uuid and status = 'active')`);
}
