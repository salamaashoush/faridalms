import type { GradeView } from "@faridalms/domain/grading";

import { scaleVersionsOf } from "@faridalms/database/stores/grading";
import { gradeOf } from "@faridalms/domain/grading";

import type { UnitContext } from "./context";

/**
 * Reads grades for scores pinned to scale versions: one query for every
 * version the rows name, then each score graded under its own version.
 */
export async function gradeReader(
  context: UnitContext,
  versionIds: readonly (string | null)[],
): Promise<
  (
    versionId: string | null,
    score: number | null,
    max: number | null,
  ) => GradeView | null
> {
  const ids = [...new Set(versionIds.filter((id): id is string => !!id))];
  const versions = new Map(
    (await scaleVersionsOf(context.tx, context.tenantId, ids)).map((row) => [
      row.id,
      row,
    ]),
  );
  return (versionId, score, max) =>
    gradeOf(versionId ? versions.get(versionId) : undefined, score, max);
}
