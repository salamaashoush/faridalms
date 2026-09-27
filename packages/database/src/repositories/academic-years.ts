import type { Database, DatabaseTransaction } from "../index";

import { ManagementError } from "./management";

type Executor = Database | DatabaseTransaction;

/** Refuses a write into a closed year; reopening it is the correction path. */
export async function assertYearOpen(db: Executor, schoolYearId: string) {
  const year = await db.query.schoolYears.findFirst({
    where: { id: schoolYearId },
    columns: { status: true },
  });
  if (year?.status === "closed")
    throw new ManagementError("CONFLICT", "academic_year.closed");
}

export async function assertClassYearOpen(db: Executor, classId: string) {
  const row = await db.query.classes.findFirst({
    where: { id: classId },
    columns: { schoolYearId: true },
  });
  if (row) await assertYearOpen(db, row.schoolYearId);
}

/** The day placements are read on: today, held inside the year's dates. */
export function placementDate(
  year: { startsOn: string; endsOn: string },
  today: string,
) {
  if (today < year.startsOn) return year.startsOn;
  if (today > year.endsOn) return year.endsOn;
  return today;
}
