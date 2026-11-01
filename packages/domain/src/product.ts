import * as v from "valibot";

/** Who is asking for a demonstration, as the product site offers it. */
export const DEMO_ROLES = [
  "leader",
  "teacher",
  "it",
  "parent",
  "other",
] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

/** Roughly how many students the school has. */
export const DEMO_SIZES = ["under_200", "200_1000", "over_1000"] as const;
export type DemoSize = (typeof DEMO_SIZES)[number];

const text = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const optionalText = (max: number) =>
  v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max)), "");

/**
 * A request for a demonstration from the product site. `website` is a field
 * people never see and `elapsed` how long the form was open: a script fills
 * the first and is faster than a person, and either answers it unheard.
 */
export const demoRequestSchema = v.object({
  locale: v.picklist(["en", "ar"]),
  name: text(120),
  email: v.pipe(v.string(), v.trim(), v.maxLength(254), v.email()),
  school: text(160),
  role: v.picklist(DEMO_ROLES),
  size: v.optional(v.picklist(DEMO_SIZES)),
  phone: optionalText(40),
  message: optionalText(2000),
  website: v.optional(v.pipe(v.string(), v.maxLength(200)), ""),
  elapsed: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type DemoRequest = v.InferOutput<typeof demoRequestSchema>;
