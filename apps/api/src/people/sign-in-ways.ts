import type { SignInSeed } from "@faridalms/database/stores/students";
import type { SignInRefusal } from "@faridalms/domain/first-sign-in";

import type { UnitContext } from "../core/context";

import { point } from "../core/extension";

export type Refused = { studentId: string; reason: SignInRefusal };

/** Who of the students picked a way opens a sign-in for, who has one already, and who it cannot. */
export interface SignInPlan {
  ready: { seed: SignInSeed }[];
  had: string[];
  refused: Refused[];
}

/** What opening the sign-ins gave: what to print or hand out, never shown again. */
export interface SignInsOpened {
  slips: { studentId: string; loginName: string; password: string }[];
  badges: { studentId: string; secret: string }[];
  invited: string[];
  had: string[];
  refused: Refused[];
}

/** A way a module opens students' sign-ins beside a password: a badge, say. */
export interface SignInWay {
  way: string;
  plan(context: UnitContext, seeds: readonly SignInSeed[]): Promise<SignInPlan>;
  open(
    context: UnitContext,
    seeds: readonly SignInSeed[],
  ): Promise<SignInsOpened>;
}

export const signInWays = point<SignInWay>("sign-in ways");

// An account opened by a link that nobody has used yet is not turned off.
export const turnedOff = (seed: SignInSeed) =>
  seed.accountState !== null &&
  seed.accountState !== "active" &&
  seed.accountState !== "invited";

/**
 * What a module refuses a student's leaving for, as a code with its detail:
 * a register that marks them after their last day, say.
 */
export interface LeavingGuard {
  refuses(
    context: UnitContext,
    input: { studentId: string; leftOn: string },
  ): Promise<string | null>;
}

export const leavingGuards = point<LeavingGuard>("leaving guards");
