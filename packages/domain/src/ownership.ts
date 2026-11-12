import type { ModuleId } from "./modules";

/** Who a table or a descriptor namespace belongs to. */
export type Owner<Id extends string = ModuleId> = "core" | Id;

/**
 * A table's owner, and for a link between two modules neither of which
 * requires the other, the modules it needs beyond what its owner requires:
 * it has rows only where all of them are on. A core table needs nothing.
 */
export type Ownership<Id extends string = ModuleId> =
  | { owner: "core" }
  | { owner: Id; needs?: readonly Id[] };

type Requirements<Id extends string> = Readonly<
  Record<Id, { requires: readonly (readonly NoInfer<Id>[])[] }>
>;

/**
 * The modules on wherever a module is on. `requires` lists alternative
 * groups, so only what every alternative brings, with what that requires in
 * turn, is certain.
 */
export function guaranteedBy<Id extends string>(
  module: NoInfer<Id>,
  modules: Requirements<Id>,
): ReadonlySet<Id> {
  const alternatives = modules[module].requires.map(
    (group) =>
      new Set(group.flatMap((need) => [need, ...guaranteedBy(need, modules)])),
  );
  const [first, ...rest] = alternatives;
  if (!first) return new Set();
  return new Set(
    [...first].filter((id) => rest.every((group) => group.has(id))),
  );
}

/** Every module on wherever a table's rows can exist; empty for a core table. */
export function presentWith<Id extends string>(
  table: Ownership<NoInfer<Id>>,
  modules: Requirements<Id>,
): ReadonlySet<Id> {
  const present = new Set<Id>();
  if (table.owner === "core") return present;
  for (const module of [
    table.owner,
    ...("needs" in table ? (table.needs ?? []) : []),
  ]) {
    present.add(module);
    for (const id of guaranteedBy(module, modules)) present.add(id);
  }
  return present;
}

/**
 * Whether a table may hold a key to a table, or a column of a descriptor
 * namespace, that `target` owns: core is reached by everything, a module
 * only by tables whose rows cannot exist without it.
 */
export const mayReach = <Id extends string>(
  table: Ownership<NoInfer<Id>>,
  target: Owner<NoInfer<Id>>,
  modules: Requirements<Id>,
): boolean => target === "core" || presentWith(table, modules).has(target);
