import type { CellTransaction } from "@faridalms/database/context";
import type { Directory } from "@faridalms/database/directory/client";
import type { ModuleId } from "@faridalms/domain/modules";

import type { SchoolContext } from "./context";

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

/**
 * What one module contributes, made only where it is on, and where the
 * modules it `needs` are on too: a contribution to the point of a module it
 * does not require is the code's link between the two.
 */
export interface ModuleContributions {
  module: ModuleId;
  needs?: readonly ModuleId[];
  contributions: readonly Contribution[];
}

/**
 * What says which modules are on at a school and what they contribute: a
 * unit of work, or a background worker acting for one school without an
 * actor.
 */
export interface ModuleScope extends Pick<
  SchoolContext,
  "school" | "extensions"
> {
  tx: CellTransaction;
  tenantId: string;
  schoolId: string;
}

/** The values the modules on at the school contribute to a point. */
export async function contributionsTo<T>(
  context: ModuleScope,
  to: Point<T>,
): Promise<T[]> {
  const on = await modulesOf(context);
  return context.extensions.flatMap((entry) =>
    on[entry.module] && (entry.needs ?? []).every((need) => on[need])
      ? entry.contributions
          .filter((contribution) => contribution.point === to)
          .map((contribution) => contribution.value as T)
      : [],
  );
}

/**
 * How a background worker learns which modules are on at a school, as a
 * request does: the school's entitlements from the directory, its own
 * switches in the cell, and every module's contributions.
 */
export interface WorkerModules {
  directory: Pick<Directory, "schoolsOfTenant">;
  extensions: readonly ModuleContributions[];
}

/** A worker's module scope for one school of a tenant, or null for a school the directory does not hold. */
export async function workerScope(
  modules: WorkerModules,
  input: { tx: CellTransaction; tenantId: string; schoolId: string },
): Promise<ModuleScope | null> {
  const school = (await modules.directory.schoolsOfTenant(input.tenantId)).find(
    (row) => row.schoolId === input.schoolId,
  );
  return school ? { ...input, school, extensions: modules.extensions } : null;
}

/**
 * The scopes of a tenant's schools where every module given is on: where a
 * module's worker looks for work to do.
 */
export async function schoolsWith(
  modules: WorkerModules,
  input: { tx: CellTransaction; tenantId: string },
  needed: readonly ModuleId[],
): Promise<ModuleScope[]> {
  const found: ModuleScope[] = [];
  for (const school of await modules.directory.schoolsOfTenant(
    input.tenantId,
  )) {
    const scope = {
      ...input,
      schoolId: school.schoolId,
      school,
      extensions: modules.extensions,
    };
    const on = await modulesOf(scope);
    if (needed.every((id) => on[id])) found.push(scope);
  }
  return found;
}
