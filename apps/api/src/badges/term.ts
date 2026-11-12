import { BADGE_DAYS } from "@faridalms/domain/badges";

import type { UnitContext } from "../core/context";

import { contributionsTo } from "../core/extension";
import { badgeEnds } from "./points";

/**
 * How long a badge printed now lasts: until it has gone unused for the
 * sliding term, and never past what a module ends it at.
 */
export async function badgeTerm(context: UnitContext) {
  const expiresAt = new Date(context.now.getTime() + BADGE_DAYS * 86_400_000);
  const ends = await Promise.all(
    (await contributionsTo(context, badgeEnds)).map((source) =>
      source.endOf(context, { today: context.today, otherwise: expiresAt }),
    ),
  );
  const set = ends.filter((end): end is Date => end !== null);
  const until = set.length
    ? new Date(Math.min(...set.map((end) => end.getTime())))
    : expiresAt;
  return { expiresAt, until };
}
