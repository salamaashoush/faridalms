import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { orgPath } from "./identity";
import { uuidArray } from "./sql";

export interface Descriptor {
  id: string;
  code: string;
  meaning: string | null;
  labelEn: string | null;
  labelAr: string | null;
  color: string | null;
  sortOrder: number;
  schoolOnly: boolean;
}

/**
 * A namespace's values as one school sees them: tenant-wide values and the
 * school's own, each label resolved from the override at the nearest org on
 * the path from the school to the root, then from the value itself. Values a
 * school retired stay readable on old rows but are left out here unless asked.
 */
export async function descriptorsFor(
  tx: CellTransaction,
  input: {
    tenantId: string;
    schoolId: string;
    namespace: string;
    today: string;
    includeRetired?: boolean;
  },
): Promise<Descriptor[]> {
  const path = await orgPath(tx, input.tenantId, input.schoolId);
  const rows = await tx.execute<{
    id: string;
    code: string;
    meaning: string | null;
    label_en: string | null;
    label_ar: string | null;
    color: string | null;
    sort_order: number;
    school_only: boolean;
    effective: boolean;
  }>(sql`
    select d.id, d.code_value as code, d.system_meaning as meaning,
           coalesce(o.label_en, d.label_en) as label_en,
           coalesce(o.label_ar, d.label_ar) as label_ar,
           coalesce(o.color, d.color) as color,
           coalesce(o.sort_order, d.sort_order) as sort_order,
           d.org_id is not null as school_only,
           coalesce(o.effective_during, d.effective_during) @> ${input.today}::date as effective
    from core.descriptors d
    left join lateral (
      select x.label_en, x.label_ar, x.color, x.sort_order, x.effective_during
      from core.descriptor_overrides x
      where x.tenant_id = d.tenant_id and x.descriptor_id = d.id and x.status = 'active'
        and x.org_id = any(${uuidArray(path)})
      order by array_position(${uuidArray(path)}, x.org_id)
      limit 1
    ) o on true
    where d.tenant_id = ${input.tenantId}::uuid and d.namespace = ${input.namespace}
      and d.status = 'active' and (d.org_id is null or d.org_id = any(${uuidArray(path)}))
    order by 7, d.code_value`);
  return rows
    .filter((row) => input.includeRetired || row.effective)
    .map((row) => ({
      id: row.id,
      code: row.code,
      meaning: row.meaning,
      labelEn: row.label_en,
      labelAr: row.label_ar,
      color: row.color,
      sortOrder: row.sort_order,
      schoolOnly: row.school_only,
    }));
}

/** One value by code, for code paths that key off a fixed value. */
export async function descriptorId(
  tx: CellTransaction,
  tenantId: string,
  namespace: string,
  code: string,
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    select id from core.descriptors
    where tenant_id = ${tenantId}::uuid and namespace = ${namespace} and code_value = ${code}
      and org_id is null and status = 'active'`);
  const row = rows[0];
  if (!row) throw new Error(`descriptor ${namespace}/${code} is missing`);
  return row.id;
}
