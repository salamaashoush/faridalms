import type { SignInSeed } from "@faridalms/database/stores/students";
import type { SignInRefusal } from "@faridalms/domain/first-sign-in";

import { badgesOf, issueBadge } from "@faridalms/database/stores/badges";

import type { UnitContext } from "../core/context";
import type { SignInWay } from "../people/sign-in-ways";

import { audit } from "../core/procedure";
import { issueBadgeSecret } from "../core/session";
import { youngStudentsOf } from "../people/points";
import { turnedOff } from "../people/sign-in-ways";
import { badgeTerm } from "./term";

/**
 * Who of the students picked gets a badge: young children who hold none
 * that works. A working badge is kept, since a new one would stop the card
 * in the child's bag.
 */
async function badgesPlan(context: UnitContext, seeds: readonly SignInSeed[]) {
  const ids = seeds.map((row) => row.userId);
  const [young, held] = await Promise.all([
    youngStudentsOf(context, ids, context.today),
    badgesOf(context.tx, context.tenantId, ids),
  ]);
  const now = context.now.toISOString();
  const works = (seed: SignInSeed) =>
    (held.get(seed.userId)?.expiresAt ?? "") > now;
  const refusal = (seed: SignInSeed): SignInRefusal | null =>
    young.has(seed.userId)
      ? turnedOff(seed)
        ? "disabled"
        : null
      : "not_young";
  return {
    ready: seeds
      .filter((seed) => !refusal(seed) && !works(seed))
      .map((seed) => ({ seed })),
    had: seeds
      .filter((seed) => !refusal(seed) && works(seed))
      .map((seed) => seed.userId),
    refused: seeds.flatMap((seed) => {
      const reason = refusal(seed);
      return reason ? [{ studentId: seed.userId, reason }] : [];
    }),
  };
}

/** A badge for each young student who holds none that works. */
async function openBadges(context: UnitContext, seeds: readonly SignInSeed[]) {
  const [plan, term] = await Promise.all([
    badgesPlan(context, seeds),
    badgeTerm(context),
  ]);
  const refused = [...plan.refused];
  const badges: { studentId: string; secret: string }[] = [];
  for (const { seed } of plan.ready) {
    const studentId = seed.userId;
    const { secret, secretHash } = issueBadgeSecret();
    const account = await issueBadge(context.tx, {
      tenantId: context.tenantId,
      userId: studentId,
      secretHash,
      ...term,
      linkedByUserId: context.actor.userId,
    });
    // Turned off between the plan and now.
    if (!account) {
      refused.push({ studentId, reason: "disabled" });
      continue;
    }
    await audit(context, {
      action: account.created ? "account.create" : "account.badge_issue",
      objectType: "account",
      objectId: account.accountId,
      subjectUserId: studentId,
      details: { method: "badge" },
    });
    badges.push({ studentId, secret });
  }
  return { slips: [], badges, invited: [], had: plan.had, refused };
}

/** Badges, for the young children who sign in by scanning one. */
export const BADGE_WAY: SignInWay = {
  way: "badges",
  plan: badgesPlan,
  open: openBadges,
};
