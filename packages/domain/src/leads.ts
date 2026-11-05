import * as v from "valibot";

import { MODULE_IDS } from "./modules";
import { DEMO_ROLES, DEMO_SIZES } from "./product";

/** Where a lead stands, from first contact to won or lost. */
export const LEAD_STATES = [
  "new",
  "contacted",
  "demo_booked",
  "demo_done",
  "proposal",
  "won",
  "lost",
] as const;
export type LeadState = (typeof LEAD_STATES)[number];

/** Why a lead was lost, from a fixed list so the reasons can be counted. */
export const LOST_REASONS = [
  "price",
  "timing",
  "competitor",
  "no_response",
  "not_fit",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

/** How a lead reached the business. */
export const LEAD_SOURCES = ["demo_form", "module_interest", "manual"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const ACTIVITY_KINDS = ["call", "meeting", "email", "note"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** How long a lead that was lost is kept after it was last contacted. */
export const LOST_LEAD_MONTHS = 24;

const text = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const optionalText = (max: number) =>
  v.pipe(
    v.optional(v.nullable(v.string()), null),
    v.transform((value) => value?.trim() || null),
    v.nullable(v.pipe(v.string(), v.maxLength(max))),
  );
const email = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.maxLength(254),
  v.email("Enter an email address."),
);
const country = v.nullable(
  v.pipe(v.string(), v.trim(), v.toUpperCase(), v.regex(/^[A-Z]{2}$/)),
);

/**
 * A lead as a cell sends it to the console: a demonstration request from
 * the product site, or a school's administrator asking about a module. The
 * id makes a resend after a lost answer write nothing twice.
 */
export const leadIntakeSchema = v.object({
  intakeId: v.pipe(v.string(), v.uuid()),
  source: v.picklist(["demo_form", "module_interest"]),
  name: text(120),
  email: v.nullable(email),
  phone: optionalText(40),
  organisation: text(160),
  role: v.nullable(v.picklist(DEMO_ROLES)),
  size: v.nullable(v.picklist(DEMO_SIZES)),
  country,
  locale: v.picklist(["en", "ar"]),
  message: optionalText(2000),
  /** For a school asking about a module: which school, tenant and module. */
  schoolId: v.nullable(v.pipe(v.string(), v.uuid())),
  tenantId: v.nullable(v.pipe(v.string(), v.uuid())),
  module: v.nullable(v.picklist(MODULE_IDS)),
});
export type LeadIntake = v.InferOutput<typeof leadIntakeSchema>;

/** A lead an operator enters by hand, or changes. */
export const leadSchema = v.object({
  name: text(120),
  email: v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.maxLength(254),
    v.transform((value) => value || null),
    v.nullable(v.pipe(v.string(), v.email("Enter an email address."))),
  ),
  phone: optionalText(40),
  organisation: text(160),
  size: v.nullable(v.picklist(DEMO_SIZES)),
  country,
  locale: v.picklist(["en", "ar"]),
});
export type LeadInput = v.InferOutput<typeof leadSchema>;

/** Where a lead moves, with why it was lost when it was. */
export const leadStateSchema = v.pipe(
  v.object({
    state: v.picklist(LEAD_STATES),
    lostReason: v.nullable(v.picklist(LOST_REASONS)),
  }),
  v.check(
    (input) => (input.state === "lost") === (input.lostReason !== null),
    "A lost lead says why it was lost, and only a lost one.",
  ),
);
