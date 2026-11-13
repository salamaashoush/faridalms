import type { ModuleId } from "@faridalms/domain/modules";

import type { UnitContext } from "./context";

import { contributionsTo, point } from "./extension";
import { modulesOf } from "./modules";

/**
 * A module's choice among the words it offers for its own concept, as the
 * school set it: the grade levels module's "level" for a grade, say. Null
 * until the school chooses, which reads as the module always has.
 */
export interface ModuleWording {
  module: ModuleId;
  wordOf: (context: UnitContext) => Promise<string | null>;
}

export const moduleWording = point<ModuleWording>("module wording");

/** Which modules are on at the school, and the word each on module was given. */
export async function modulesFace(context: UnitContext) {
  const wordings = await contributionsTo(context, moduleWording);
  const words = await Promise.all(
    wordings.map(async (each) => [each.module, await each.wordOf(context)]),
  );
  return {
    modules: await modulesOf(context),
    wording: Object.fromEntries(
      words.filter((entry): entry is [ModuleId, string] => entry[1] !== null),
    ) as Partial<Record<ModuleId, string>>,
  };
}
