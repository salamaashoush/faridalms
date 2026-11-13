import type { GradeTerm } from "@faridalms/domain/grade-levels";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

/** The word the school chose for its grades, or null before it chooses. */
export async function gradeTermOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<{ term: GradeTerm | null; version: number }> {
  const [row] = await tx.execute<{ term: GradeTerm; version: number }>(sql`
    select term, version from core.grade_level_settings
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'`);
  return row
    ? { term: row.term, version: row.version }
    : { term: null, version: 0 };
}

/** Sets the school's word for its grades, if nobody changed it since `expectedVersion`; null when it moved on. */
export async function setGradeTerm(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    term: GradeTerm;
    expectedVersion: number;
  },
): Promise<number | null> {
  const [row] =
    input.expectedVersion === 0
      ? await tx.execute<{ version: number }>(sql`
          insert into core.grade_level_settings (tenant_id, org_id, term)
          values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.term})
          on conflict do nothing
          returning version`)
      : await tx.execute<{ version: number }>(sql`
          update core.grade_level_settings set term = ${input.term}
          where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
            and status = 'active' and version = ${input.expectedVersion}
          returning version`);
  return row?.version ?? null;
}
