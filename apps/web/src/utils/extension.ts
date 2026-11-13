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
 * The word a school chose for a module's concept, by module, where the
 * module offers a choice and the school made one: "level" for a grade.
 */
export type Wording = Readonly<Partial<Record<ModuleId, string>>>;

/** What the viewer's school has on, and the words it chose, as the current user's face says. */
export interface SchoolFace {
  modules: Readonly<Record<ModuleId, boolean>>;
  wording: Wording;
}

/**
 * What one module puts in the slots, shown only where it is on, and where
 * the modules it `needs` are on too: a filling of the slot of a module it
 * does not require is the page's link between the two. A module whose
 * words the school chooses gives its fillings in those words.
 */
export interface ModuleFillings {
  module: ModuleId;
  needs?: readonly ModuleId[];
  fillings: readonly Filling[] | ((wording: Wording) => readonly Filling[]);
}

/** A module's fillings in the words given. */
export const fillingsOf = (entry: ModuleFillings, wording: Wording) =>
  typeof entry.fillings === "function"
    ? entry.fillings(wording)
    : entry.fillings;

/** What the modules on at the school put in a slot, in the words it chose. */
export function filled<T>(
  extensions: readonly ModuleFillings[],
  face: SchoolFace,
  to: Slot<T>,
): T[] {
  const { modules, wording } = face;
  return extensions.flatMap((entry) =>
    modules[entry.module] && (entry.needs ?? []).every((need) => modules[need])
      ? fillingsOf(entry, wording)
          .filter((filling) => filling.slot === to)
          .map((filling) => filling.value as T)
      : [],
  );
}

/** The query of a filling whose words need nothing read. */
export const NOTHING_READ: SlotQuery<null> = {
  queryKey: ["slots", "nothing"],
  queryFn: () => Promise.resolve(null),
};

/**
 * Every module's fillings of a slot, on or off at the school: only for a
 * page before sign-in, which knows nothing of the school's modules and
 * picks among them by what the server says the school shows strangers, and
 * for the switch that turns a module on, which shows while it is off.
 */
export function everyFilling<T>(
  extensions: readonly ModuleFillings[],
  to: Slot<T>,
): T[] {
  return extensions.flatMap((entry) =>
    fillingsOf(entry, {})
      .filter((filling) => filling.slot === to)
      .map((filling) => filling.value as T),
  );
}
