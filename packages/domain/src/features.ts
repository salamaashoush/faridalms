/**
 * Switches a school turns areas on and off with. A feature is on at a school
 * when the nearest row on the path from the school to the root says so, and
 * otherwise takes its default here.
 */
export const FEATURES = ["elearning", "early_years"] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_DEFAULTS: Record<Feature, boolean> = {
  elearning: false,
  early_years: false,
};
