import { ageOn } from "./school";

/**
 * What acting for a learner is for: following them in the portal, being
 * contacted about them, taking the school's notices, being called, reading
 * their medical summary, consenting for them and deciding for them.
 */
export const ACTING_PURPOSES = [
  "follow",
  "contact",
  "notice",
  "call",
  "health",
  "consent",
  "decide",
] as const;
export type ActingPurpose = (typeof ACTING_PURPOSES)[number];

/**
 * Whether someone born on `birthDate` has reached `years` on the day: their
 * birthday that year has come. One born on 29 February reaches it on 1 March
 * of a year without one. No birth date never reaches it.
 */
export function ageReached(
  birthDate: string | null,
  on: string,
  years: number,
): boolean {
  return (ageOn(birthDate, on)?.years ?? -1) >= years;
}
