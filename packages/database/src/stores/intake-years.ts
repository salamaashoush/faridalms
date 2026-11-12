import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface IntakeYear {
  yearId: string;
  titleEn: string | null;
  titleAr: string | null;
  startsOn: string;
  endsBefore: string;
}

/** The school year each intake admits into, of those that name one. */
export async function yearsOfIntakes(
  tx: Tx,
  input: { tenantId: string; intakeIds: readonly string[] },
): Promise<Map<string, IntakeYear>> {
  if (input.intakeIds.length === 0) return new Map();
  const rows = await tx.execute<{
    intake_id: string;
    year_id: string;
    title_en: string | null;
    title_ar: string | null;
    starts_on: string;
    ends_before: string;
  }>(sql`
    select l.intake_id, l.school_year_id as year_id, y.title_en, y.title_ar,
      lower(y.span)::text as starts_on, upper(y.span)::text as ends_before
    from core.intake_years l
    join core.academic_sessions y on y.tenant_id = l.tenant_id and y.id = l.school_year_id
      and y.status = 'active'
    where l.tenant_id = ${input.tenantId}::uuid and l.status = 'active'
      and l.intake_id = any(${uuidArray(input.intakeIds)})`);
  return new Map(
    rows.map((row) => [
      row.intake_id,
      {
        yearId: row.year_id,
        titleEn: row.title_en,
        titleAr: row.title_ar,
        startsOn: row.starts_on,
        endsBefore: row.ends_before,
      },
    ]),
  );
}

/** The intakes admitting into a year. */
export async function intakesOfYear(
  tx: Tx,
  input: { tenantId: string; orgId: string; yearId: string },
): Promise<string[]> {
  const rows = await tx.execute<{ intake_id: string }>(sql`
    select l.intake_id from core.intake_years l
    join core.admission_intakes i on i.tenant_id = l.tenant_id and i.id = l.intake_id
      and i.status = 'active'
    where l.tenant_id = ${input.tenantId}::uuid and l.org_id = ${input.orgId}::uuid
      and l.school_year_id = ${input.yearId}::uuid and l.status = 'active'`);
  return rows.map((row) => row.intake_id);
}

/** Names the year an intake admits into, or none. */
export async function setIntakeYear(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    intakeId: string;
    yearId: string | null;
  },
) {
  await tx.execute(sql`
    update core.intake_years set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and intake_id = ${input.intakeId}::uuid
      and status = 'active' and school_year_id is distinct from ${input.yearId}::uuid`);
  if (input.yearId)
    await tx.execute(sql`
      insert into core.intake_years (tenant_id, org_id, intake_id, school_year_id)
      select ${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.intakeId}::uuid, ${input.yearId}::uuid
      where not exists (select 1 from core.intake_years where tenant_id = ${input.tenantId}::uuid
        and intake_id = ${input.intakeId}::uuid and status = 'active')`);
}
