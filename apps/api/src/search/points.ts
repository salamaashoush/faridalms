import type { FoundRow } from "@faridalms/database/stores/search";
import type { MentionKind } from "@faridalms/domain/content";
import type { SearchKind, SearchTarget } from "@faridalms/domain/search";
import type { SQL } from "drizzle-orm";

import type { UnitContext } from "../core/context";

import { reachAt } from "../core/audiences";
import { point } from "../core/extension";
import { can } from "../core/procedure";
import { studentsReached } from "../core/reach";

export interface Resolver {
  /** The ids of the kind the viewer may open, which the index ranks among. */
  within: SQL;
  /** Reads candidates back through the same rule, for what the hit shows. */
  resolve: (ids: string[]) => Promise<FoundRow[]>;
}

/**
 * A kind of thing search finds that a module keeps: its index types, the
 * page each opens, the mentions read by its rule, and that rule.
 */
export interface SearchSource {
  kind: SearchKind;
  targets: Readonly<Record<string, SearchTarget>>;
  mentions: readonly MentionKind[];
  resolver(context: UnitContext, q: string): Promise<Resolver>;
}

export const searchSources = point<SearchSource>("search sources");

/** The students whose work the viewer follows: themselves, or those a module says they follow. */
export async function learnersOf(context: UnitContext) {
  const own = can(context, "own-work:read") ? [context.actor.userId] : [];
  if (!can(context, "children:read")) return own;
  const reached = await studentsReached(
    context,
    "people",
    context.actor.follows,
  );
  return [...own, ...context.actor.follows.filter((id) => reached.has(id))];
}

/** The classes the given students are in today. */
export async function learnerClasses(
  context: UnitContext,
  learners: readonly string[],
) {
  const reaches = await Promise.all(
    learners.map((userId) => reachAt(context, { userId, on: context.today })),
  );
  return [...new Set(reaches.flatMap((reach) => reach.classIds))];
}
