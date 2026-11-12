import { findBadge } from "@faridalms/database/stores/badges";

import type { ModuleContributions } from "../core/extension";

import { checkInCards } from "../attendance/points";
import { contribute } from "../core/extension";
import { badgeHash } from "../core/session";

/** A child checks in to a register by scanning the badge they sign in with. */
export const BADGES_AT_CHECK_IN: ModuleContributions = {
  module: "badges",
  needs: ["attendance"],
  contributions: [
    contribute(checkInCards, {
      holderOf: async (context, secret) => {
        const holder = await findBadge(context.tx, badgeHash(secret));
        return holder?.accountState === "active" ? holder.userId : null;
      },
    }),
  ],
};
