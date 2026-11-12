import type { NormRow, ReadingLanguage } from "@faridalms/domain/reading";

import { readingNormsOf } from "@faridalms/database/stores/reading";
import { DEFAULT_NORMS, READING_LANGUAGES } from "@faridalms/domain/reading";

import type { UnitContext } from "../core/context";

import { requireReadingGrades } from "./points";

/** The norms the school reads by, each language its own or the defaults. */
export async function normsIn(context: UnitContext) {
  await requireReadingGrades(context);
  const saved = await readingNormsOf(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
  });
  return Object.fromEntries(
    READING_LANGUAGES.map((language) => {
      const own = saved.find((row) => row.language === language);
      return [
        language,
        {
          rows: own?.rows ?? DEFAULT_NORMS[language],
          own: own !== undefined,
          version: own?.version ?? 0,
        },
      ];
    }),
  ) as Record<
    ReadingLanguage,
    { rows: NormRow[]; own: boolean; version: number }
  >;
}
