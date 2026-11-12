import type { Arrangements } from "@faridalms/domain/arrangements";

import { NO_ARRANGEMENTS } from "@faridalms/domain/arrangements";

import type { UnitContext } from "../core/context";
import type { ModuleScope } from "../core/extension";

import { contributionsTo, point } from "../core/extension";

/**
 * Where what a student is allowed beyond everyone else is kept: extra time,
 * a computer reader, days added to due dates. With nothing kept, or the
 * keeper's module off, a student is allowed what everyone is.
 */
export interface AllowanceKeeper {
  of(
    scope: ModuleScope,
    studentIds: readonly string[],
  ): Promise<ReadonlyMap<string, Arrangements>>;
}

export const allowanceKeepers = point<AllowanceKeeper>("allowance keepers");

/** What work already set does when a student's allowances change: its due dates move, say. */
export interface AllowanceFollower {
  changed(
    context: UnitContext,
    input: { studentIds: readonly string[]; from: Date },
  ): Promise<void>;
}

export const allowanceFollowers = point<AllowanceFollower>(
  "allowance followers",
);

/** Each student's allowances, everyone's for a student with none kept. */
export async function allowancesOf(
  scope: ModuleScope,
  studentIds: readonly string[],
): Promise<Map<string, Arrangements>> {
  const found = new Map(studentIds.map((id) => [id, NO_ARRANGEMENTS]));
  if (studentIds.length === 0) return found;
  for (const keeper of await contributionsTo(scope, allowanceKeepers))
    for (const [id, arrangements] of await keeper.of(scope, studentIds))
      found.set(id, arrangements);
  return found;
}

export async function allowancesChanged(
  context: UnitContext,
  input: { studentIds: readonly string[]; from: Date },
): Promise<void> {
  for (const follower of await contributionsTo(context, allowanceFollowers))
    await follower.changed(context, input);
}
