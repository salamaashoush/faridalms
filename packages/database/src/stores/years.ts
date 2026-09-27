import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { YearLifecycle } from "../tables/calendar";

import { bounds } from "./sql";

export interface SchoolYear {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
  startsOn: string;
  endsBefore: string;
  schoolYear: number;
  lifecycle: YearLifecycle;
  version: number;
}

export async function schoolYears(
  tx: CellTransaction,
  tenantId: string,
  schoolId: string,
): Promise<SchoolYear[]> {
  const rows = await tx.execute<{
    id: string;
    title_en: string | null;
    title_ar: string | null;
    span: string;
    school_year: number;
    lifecycle: YearLifecycle;
    version: number;
  }>(sql`
    select id, title_en, title_ar, span::text as span, school_year, lifecycle, version
    from core.academic_sessions
    where tenant_id = ${tenantId}::uuid and org_id = ${schoolId}::uuid
      and type = 'school_year' and status = 'active'
    order by lower(span) desc`);
  return rows.map((row) => {
    const { from, to } = bounds(row.span);
    return {
      id: row.id,
      titleEn: row.title_en,
      titleAr: row.title_ar,
      startsOn: from,
      endsBefore: to ?? from,
      schoolYear: row.school_year,
      lifecycle: row.lifecycle,
      version: row.version,
    };
  });
}

/**
 * The year a list shows by default: the current one, or when a school has
 * none marked current, the year whose dates hold today, else the latest.
 */
export function workingYear(years: SchoolYear[], today: string) {
  return (
    years.find((year) => year.lifecycle === "current") ??
    years.find((year) => year.startsOn <= today && today < year.endsBefore) ??
    years[0] ??
    null
  );
}
