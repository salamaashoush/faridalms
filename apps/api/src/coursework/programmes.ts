import {
  classesWithoutChosenProgramme,
  deriveProgrammes,
  programmesOf,
} from "@faridalms/database/stores/grading";

import type { UnitContext } from "../core/context";

import { contributionsTo } from "../core/extension";
import { programmeDefaults, programmePartsOf } from "./points";

/**
 * Writes again the programme each class follows where the school chose
 * none for it: the one a module gives, else none.
 */
export async function rederiveProgrammes(
  context: UnitContext,
  classIds: readonly string[],
) {
  const open = await classesWithoutChosenProgramme(context.tx, {
    tenantId: context.tenantId,
    classIds,
  });
  if (open.length === 0) return;
  const programmes = new Map<string, string | null>(
    open.map((id) => [id, null]),
  );
  for (const defaults of await contributionsTo(context, programmeDefaults))
    for (const [classId, programmeId] of await defaults.programmesFor(
      context,
      open,
    ))
      if (programmeId && programmes.get(classId) === null)
        programmes.set(classId, programmeId);
  await deriveProgrammes(context.tx, {
    tenantId: context.tenantId,
    programmes,
  });
}

/** The school's programmes, each with what the modules keep about it. */
export async function programmesWithParts(context: UnitContext) {
  const programmes = await programmesOf(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
  });
  const parts = await programmePartsOf(
    context,
    programmes.map((row) => row.id),
  );
  return programmes.map((row) => ({ ...row, parts: parts.get(row.id) ?? {} }));
}
