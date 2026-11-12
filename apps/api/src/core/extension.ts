import type { ModuleId } from "@faridalms/domain/modules";

import type { UnitContext } from "./context";

import { modulesOf } from "./modules";

declare const carries: unique symbol;

/**
 * A place where what a module knows reaches code that may not name it: the
 * consumer declares the point next to itself, and each module that knows
 * contributes a value of its type in the composition root.
 */
export interface Point<T> {
  readonly name: string;
  readonly [carries]?: T;
}

export const point = <T>(name: string): Point<T> => ({ name });

export interface Contribution {
  readonly point: Point<unknown>;
  readonly value: unknown;
}

export const contribute = <T>(to: Point<T>, value: T): Contribution => ({
  point: to,
  value,
});

/** What one module contributes, made only where it is on. */
export interface ModuleContributions {
  module: ModuleId;
  contributions: readonly Contribution[];
}

/** The values the modules on at the school contribute to a point. */
export async function contributionsTo<T>(
  context: UnitContext,
  to: Point<T>,
): Promise<T[]> {
  const on = await modulesOf(context);
  return context.extensions.flatMap((entry) =>
    on[entry.module]
      ? entry.contributions
          .filter((contribution) => contribution.point === to)
          .map((contribution) => contribution.value as T)
      : [],
  );
}
