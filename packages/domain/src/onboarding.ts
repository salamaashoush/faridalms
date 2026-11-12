import * as v from "valibot";

import type { ModuleId } from "./modules";

/**
 * A new school's first steps, in the order a school usually takes them:
 * most are seen in its own data by the cell's daily measure, the first
 * invoice paid by the console, and the last three ticked by an operator.
 */
export const ONBOARDING_ITEMS = [
  "admin_signed_in",
  "school_details",
  "year_ready",
  "classes",
  "staff_invited",
  "staff_signed_in",
  "students_imported",
  "guardians_linked",
  "timetable_ready",
  "families_signed_in",
  "first_assignment",
  "first_register",
  "website_published",
  "admissions_ready",
  "custom_domain",
  "first_invoice_paid",
  "kickoff_call",
  "training",
  "data_import",
] as const;
export type OnboardingItem = (typeof ONBOARDING_ITEMS)[number];

/** Who marks each step: the cell from the school's data, the console's billing, or an operator. */
export const ONBOARDING_SOURCE: Record<
  OnboardingItem,
  "measured" | "billing" | "operator"
> = {
  admin_signed_in: "measured",
  school_details: "measured",
  year_ready: "measured",
  classes: "measured",
  staff_invited: "measured",
  staff_signed_in: "measured",
  students_imported: "measured",
  guardians_linked: "measured",
  timetable_ready: "measured",
  families_signed_in: "measured",
  first_assignment: "measured",
  first_register: "measured",
  website_published: "measured",
  admissions_ready: "measured",
  custom_domain: "measured",
  first_invoice_paid: "billing",
  kickoff_call: "operator",
  training: "operator",
  data_import: "operator",
};

export const OPERATOR_ITEMS = [
  "kickoff_call",
  "training",
  "data_import",
] as const satisfies readonly OnboardingItem[];
export type OperatorItem = (typeof OPERATOR_ITEMS)[number];

export const isOperatorItem = (item: OnboardingItem): item is OperatorItem =>
  ONBOARDING_SOURCE[item] === "operator";

/** The module a step needs before it counts; a school without it never takes the step. */
const NEEDS: Partial<Record<OnboardingItem, ModuleId>> = {
  guardians_linked: "families",
  families_signed_in: "families",
  timetable_ready: "timetable",
  first_assignment: "coursework",
  first_register: "attendance",
  website_published: "website",
  admissions_ready: "admissions",
  custom_domain: "custom_domains",
};

/**
 * The steps that apply to a school: those its modules allow, and the first
 * invoice only once it is past a trial.
 */
export function onboardingItems(school: {
  modules: readonly ModuleId[];
  onTrial: boolean;
}): OnboardingItem[] {
  return ONBOARDING_ITEMS.filter((item) => {
    const module = NEEDS[item];
    if (module && !school.modules.includes(module)) return false;
    return item !== "first_invoice_paid" || !school.onTrial;
  });
}

/**
 * The setup a school's own administrators do, in the order each depends on
 * the last: the year before its classes, classes before the students placed
 * in them, and the timetable once there are classes and teachers to plan.
 * The website and admissions can wait, so they never hold the setup open.
 */
export const SETUP_STEPS = [
  { id: "details", items: ["school_details"], optional: false },
  { id: "year", items: ["year_ready"], optional: false },
  { id: "classes", items: ["classes"], optional: false },
  { id: "staff", items: ["staff_invited"], optional: false },
  {
    id: "students",
    items: ["students_imported", "guardians_linked"],
    optional: false,
  },
  { id: "timetable", items: ["timetable_ready"], optional: false },
  { id: "website", items: ["website_published"], optional: true },
  { id: "admissions", items: ["admissions_ready"], optional: true },
] as const satisfies readonly {
  id: string;
  items: readonly OnboardingItem[];
  optional: boolean;
}[];
export type SetupStepId = (typeof SETUP_STEPS)[number]["id"];

/** The onboarding items the school's own setup steps cover. */
export const SETUP_ITEMS: ReadonlySet<OnboardingItem> = new Set(
  SETUP_STEPS.flatMap((step) => step.items),
);

export interface SetupProgress {
  id: SetupStepId;
  done: boolean;
  optional: boolean;
}

/**
 * Where a school's own setup stands: each step with an item that applies
 * to it, done once every item of it that applies is.
 */
export function setupProgress(
  applies: readonly OnboardingItem[],
  done: ReadonlySet<OnboardingItem>,
): SetupProgress[] {
  return SETUP_STEPS.flatMap((step) => {
    const items = step.items.filter((item: OnboardingItem) =>
      applies.includes(item),
    );
    return items.length === 0
      ? []
      : [
          {
            id: step.id,
            done: items.every((item) => done.has(item)),
            optional: step.optional,
          },
        ];
  });
}

/** Whether every step the school cannot do without is done. */
export const setupFinished = (steps: readonly SetupProgress[]): boolean =>
  steps.every((step) => step.done || step.optional);

/** How long a school can go without a new step before its onboarding counts as stalled. */
export const STALL_DAYS = 14;

/**
 * Whether a school's onboarding has stalled: steps still to take, and none
 * taken in the last fortnight, counted from its creation when none is.
 */
export function onboardingStalled(input: {
  applies: readonly OnboardingItem[];
  reached: ReadonlyMap<OnboardingItem, Date>;
  createdAt: Date;
  now: Date;
}): boolean {
  if (input.applies.every((item) => input.reached.has(item))) return false;
  const latest = Math.max(
    input.createdAt.getTime(),
    ...[...input.reached.values()].map((when) => when.getTime()),
  );
  return input.now.getTime() - latest > STALL_DAYS * 86_400_000;
}

export const HEALTH_LEVELS = ["green", "amber", "red"] as const;
export type HealthLevel = (typeof HEALTH_LEVELS)[number];

/** Why a school is not green, each with how much it weighs. */
export const HEALTH_REASONS = {
  quiet_in_term: "red",
  invoice_overdue: "red",
  onboarding_stalled: "amber",
  host_failing: "amber",
  deliveries_failing: "amber",
} as const satisfies Record<string, Exclude<HealthLevel, "green">>;
export type HealthReason = keyof typeof HEALTH_REASONS;

/** School days in a week below which a quiet week is a holiday, not a worry. */
const TERM_DAYS = 3;
/** Days an invoice may run overdue before the school counts as red. */
export const OVERDUE_DAYS = 30;

/**
 * A school's health from what the directory, its cell and the business know:
 * the worst of nobody signing in for a week of school, an invoice a month
 * overdue, onboarding stalled, a failing host or failing deliveries.
 */
export function healthOf(input: {
  signedIn7d: number | null;
  schoolDays7d: number | null;
  daysOverdue: number;
  onboardingStalled: boolean;
  hostFailing: boolean;
  failedDeliveries1d: number | null;
}): { level: HealthLevel; reasons: HealthReason[] } {
  const reasons: HealthReason[] = [];
  if (
    input.signedIn7d === 0 &&
    input.schoolDays7d !== null &&
    input.schoolDays7d >= TERM_DAYS
  )
    reasons.push("quiet_in_term");
  if (input.daysOverdue > OVERDUE_DAYS) reasons.push("invoice_overdue");
  if (input.onboardingStalled) reasons.push("onboarding_stalled");
  if (input.hostFailing) reasons.push("host_failing");
  if ((input.failedDeliveries1d ?? 0) > 0) reasons.push("deliveries_failing");
  const level: HealthLevel = reasons.some(
    (reason) => HEALTH_REASONS[reason] === "red",
  )
    ? "red"
    : reasons.length
      ? "amber"
      : "green";
  return { level, reasons };
}

/** An operator ticking or unticking a step only they can see done. */
export const onboardingMarkSchema = v.object({
  schoolId: v.pipe(v.string(), v.uuid()),
  item: v.picklist(OPERATOR_ITEMS),
  done: v.boolean(),
});
export type OnboardingMark = v.InferOutput<typeof onboardingMarkSchema>;
