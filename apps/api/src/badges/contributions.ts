import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { signInWays } from "../people/sign-in-ways";
import { BADGE_WAY } from "./ways";

/** What badges give the school: a way for young children to sign in. */
export const BADGES: ModuleContributions = {
  module: "badges",
  contributions: [contribute(signInWays, BADGE_WAY)],
};
