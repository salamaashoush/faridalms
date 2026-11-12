import type { ModuleId } from "@faridalms/domain/modules";

declare const carries: unique symbol;

/**
 * A place in a page where what a module shows reaches a page that may not
 * name it: the page declares the slot next to itself, and each module that
 * has something to show there fills it in the composition root.
 */
export interface Slot<T> {
  readonly name: string;
  readonly [carries]?: T;
}

export const slot = <T>(name: string): Slot<T> => ({ name });

export interface Filling {
  readonly slot: Slot<unknown>;
  readonly value: unknown;
}

export const fill = <T>(to: Slot<T>, value: T): Filling => ({
  slot: to,
  value,
});

/** What a slot's filling reads, as the page reads it alongside its own data. */
export interface SlotQuery<D> {
  queryKey: string[];
  queryFn: () => Promise<D>;
}

/**
 * What one module puts in the slots, shown only where it is on, and where
 * the modules it `needs` are on too: a filling of the slot of a module it
 * does not require is the page's link between the two.
 */
export interface ModuleFillings {
  module: ModuleId;
  needs?: readonly ModuleId[];
  fillings: readonly Filling[];
}

/** What the modules on at the school put in a slot. */
export function filled<T>(
  extensions: readonly ModuleFillings[],
  modules: Readonly<Record<ModuleId, boolean>>,
  to: Slot<T>,
): T[] {
  return extensions.flatMap((entry) =>
    modules[entry.module] && (entry.needs ?? []).every((need) => modules[need])
      ? entry.fillings
          .filter((filling) => filling.slot === to)
          .map((filling) => filling.value as T)
      : [],
  );
}
