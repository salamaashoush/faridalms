import * as v from "valibot";

import type { ModuleId } from "./modules";
import type { EntitlementsInput, SchoolNotice } from "./plans";

import { MODULE_IDS, modulesOn } from "./modules";
import { BASIC_ENTITLEMENTS, SCHOOL_NOTICES, settableOf } from "./plans";
import { schoolDate } from "./school";

/** The calendar the business's days are kept in: trials, terms, items, overrides. */
export const BUSINESS_TIME_ZONE = "Africa/Cairo";

export const businessToday = (now = new Date()) =>
  schoolDate(BUSINESS_TIME_ZONE, now);

/** How long a trial runs unless the operator sets its end. */
export const TRIAL_DAYS = 30;

/**
 * Whether a trial is over on a day. Its end date is its last day, as the
 * portal tells the school's administrators.
 */
export const trialOver = (
  subscription: { state: SubscriptionState; trialEndsOn: string | null },
  day: string,
) =>
  subscription.state === "trial" &&
  subscription.trialEndsOn !== null &&
  subscription.trialEndsOn < day;

/** The currencies a contract is priced in: EGP in Egypt, USD in the Gulf. */
export const CURRENCIES = ["EGP", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Every limit a plan sets, with null meaning unlimited where a limit may be. */
export const LIMIT_KEYS = [
  "poolBytes",
  "classBytes",
  "moduleBytes",
  "personBytes",
  "students",
  "staffAccounts",
  "videoHours",
  "customDomains",
  "emailPerMonth",
  "captionMinutes",
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];
export type Limits = Pick<EntitlementsInput, LimitKey>;

/** Storage is always a number; a quota screen shows a share of it. */
export const STORAGE_KEYS = [
  "poolBytes",
  "classBytes",
  "moduleBytes",
  "personBytes",
] as const satisfies readonly LimitKey[];

export const SUBSCRIPTION_STATES = ["trial", "active", "ended"] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

/** Annual in advance, or in two or three instalments; never monthly. */
export const BILLING_SCHEDULES = ["annual", "two", "three"] as const;
export type BillingSchedule = (typeof BILLING_SCHEDULES)[number];

export const CONTACT_ROLES = [
  "billing",
  "decision_maker",
  "technical",
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const ADD_ON_KINDS = ["module", "limit_pack", "service"] as const;
export type AddOnKind = (typeof ADD_ON_KINDS)[number];

/** How an add-on is charged: per student a year, per school a year, or once. */
export const PRICE_UNITS = ["student_year", "school_year", "once"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

/** A plan as one version of it sets what a school receives. */
export interface PlanTerms {
  modules: ModuleId[];
  limits: Limits;
}

/** What an add-on adds: a module, or an amount of one limit per unit bought. */
export interface AddOnTerms {
  kind: AddOnKind;
  module: ModuleId | null;
  limitKey: LimitKey | null;
  amount: number | null;
}

export interface SubscriptionItemTerms {
  plan: PlanTerms | null;
  addOn: AddOnTerms | null;
  quantity: number;
  /** The schools of the tenant it covers; empty covers them all. */
  schoolIds: readonly string[];
  startsOn: string;
  /** The first day it no longer applies; null while it runs. */
  endsOn: string | null;
}

/** A module or a limit set for one school or all, for a while, with a reason. */
export interface OverrideTerms {
  schoolId: string | null;
  module: ModuleId | null;
  /** For a module: whether it is given (true) or taken away (false). */
  granted: boolean | null;
  limitKey: LimitKey | null;
  /** For a limit: its value, null meaning unlimited. */
  value: number | null;
  startsOn: string;
  endsOn: string | null;
}

const runs = (span: { startsOn: string; endsOn: string | null }, day: string) =>
  span.startsOn <= day && (span.endsOn === null || day < span.endsOn);

const covers = (schoolIds: readonly string[], schoolId: string) =>
  schoolIds.length === 0 || schoolIds.includes(schoolId);

/**
 * What one school of a subscription is entitled to on a day: its plan's
 * modules and limits (Basic's where no plan covers it), the modules its
 * add-ons give, the limit packs added on, then the overrides in force,
 * with a school's own override over one for every school.
 */
export function entitlementsFor(input: {
  schoolId: string;
  day: string;
  items: readonly SubscriptionItemTerms[];
  overrides: readonly OverrideTerms[];
  trialEndsOn: string | null;
  notice: SchoolNotice | null;
}): EntitlementsInput {
  const items = input.items.filter(
    (item) => runs(item, input.day) && covers(item.schoolIds, input.schoolId),
  );
  const plan = items.find((item) => item.plan)?.plan ?? null;
  const basic = settableOf(BASIC_ENTITLEMENTS);
  const modules = new Set<ModuleId>(plan ? plan.modules : basic.modules);
  const limits: Limits = plan ? { ...plan.limits } : pickLimits(basic);
  for (const item of items) {
    const addOn = item.addOn;
    if (!addOn) continue;
    if (addOn.kind === "module" && addOn.module) modules.add(addOn.module);
    if (
      addOn.kind === "limit_pack" &&
      addOn.limitKey &&
      addOn.amount !== null
    ) {
      const held = limits[addOn.limitKey];
      // A pack adds to a limit; an unlimited one stays unlimited.
      if (held !== null)
        setLimit(limits, addOn.limitKey, held + addOn.amount * item.quantity);
    }
  }
  const overrides = input.overrides
    .filter(
      (override) =>
        runs(override, input.day) &&
        (override.schoolId === null || override.schoolId === input.schoolId),
    )
    // A school's own override is applied last, over one for every school.
    .toSorted(
      (a, b) => Number(a.schoolId !== null) - Number(b.schoolId !== null),
    );
  for (const override of overrides) {
    if (override.module && override.granted !== null) {
      if (override.granted) modules.add(override.module);
      else modules.delete(override.module);
    }
    if (override.limitKey) setLimit(limits, override.limitKey, override.value);
  }
  return {
    ...limits,
    modules: MODULE_IDS.filter((module) => modules.has(module)),
    trialEndsOn: input.trialEndsOn,
    notice: input.notice,
  };
}

const isStorage = (key: LimitKey): key is (typeof STORAGE_KEYS)[number] =>
  (STORAGE_KEYS as readonly LimitKey[]).includes(key);

/** Sets a limit; storage is never unlimited, so a null leaves it as it was. */
function setLimit(limits: Limits, key: LimitKey, value: number | null) {
  if (isStorage(key)) {
    if (value !== null) limits[key] = value;
  } else limits[key] = value;
}

/** The limits alone, from entitlements or a plan version that carries them. */
export function pickLimits(source: Limits): Limits {
  const {
    poolBytes,
    classBytes,
    moduleBytes,
    personBytes,
    students,
    staffAccounts,
    videoHours,
    customDomains,
    emailPerMonth,
    captionMinutes,
  } = source;
  return {
    poolBytes,
    classBytes,
    moduleBytes,
    personBytes,
    students,
    staffAccounts,
    videoHours,
    customDomains,
    emailPerMonth,
    captionMinutes,
  };
}

/**
 * The modules a school can use of those it is entitled to, once each
 * module's requirements are met, assuming the school switches on the ones
 * it switches itself. What the provisioning step shows, so nothing is
 * promised that the registry would turn off.
 */
export function usableModules(entitled: readonly ModuleId[]): ModuleId[] {
  const on = modulesOn({
    entitled: (id) => entitled.includes(id),
    switchedOn: () => true,
  });
  return MODULE_IDS.filter((id) => on[id]);
}

const money = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(10 ** 12),
);
const limitValue = v.nullable(
  v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2 ** 50)),
);
const storageValue = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(2 ** 50),
);
const code = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(
    /^[a-z][a-z0-9_]{1,39}$/,
    "Use lowercase letters, digits and underscores.",
  ),
);
const label = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

/** A list price: an amount in minor units (piastres, cents) per unit. */
export const priceSchema = v.object({
  currency: v.picklist(CURRENCIES),
  unit: v.picklist(PRICE_UNITS),
  amountMinor: money,
  /** The least a school pays a year at this price, in minor units. */
  minimumMinor: v.optional(money, 0),
});
export type Price = v.InferOutput<typeof priceSchema>;

export const planVersionSchema = v.object({
  planId: v.optional(v.pipe(v.string(), v.uuid())),
  code,
  nameEn: label(80),
  nameAr: label(80),
  modules: v.array(v.picklist(MODULE_IDS)),
  limits: v.object({
    poolBytes: storageValue,
    classBytes: storageValue,
    moduleBytes: storageValue,
    personBytes: storageValue,
    students: limitValue,
    staffAccounts: limitValue,
    videoHours: limitValue,
    customDomains: limitValue,
    emailPerMonth: limitValue,
    captionMinutes: limitValue,
  }),
  prices: v.pipe(v.array(priceSchema), v.maxLength(8)),
  validFrom: v.pipe(v.string(), v.isoDate()),
  reason: label(500),
});
export type PlanVersionInput = v.InferOutput<typeof planVersionSchema>;

export const addOnVersionSchema = v.pipe(
  v.object({
    addOnId: v.optional(v.pipe(v.string(), v.uuid())),
    code,
    nameEn: label(80),
    nameAr: label(80),
    kind: v.picklist(ADD_ON_KINDS),
    module: v.nullable(v.picklist(MODULE_IDS)),
    limitKey: v.nullable(v.picklist(LIMIT_KEYS)),
    amount: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
    prices: v.pipe(v.array(priceSchema), v.maxLength(8)),
    validFrom: v.pipe(v.string(), v.isoDate()),
    reason: label(500),
  }),
  v.check(
    (input) =>
      input.kind === "module"
        ? input.module !== null && input.limitKey === null
        : input.kind === "limit_pack"
          ? input.module === null &&
            input.limitKey !== null &&
            input.amount !== null
          : input.module === null && input.limitKey === null,
    "A module add-on names a module, a limit pack a limit and its amount, a service neither.",
  ),
);
export type AddOnVersionInput = v.InferOutput<typeof addOnVersionSchema>;

const uuid = v.pipe(v.string(), v.uuid());
const isoDay = v.pipe(v.string(), v.isoDate());
const optionalText = (max: number) =>
  v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(max),
    v.transform((value) => value || null),
  );

export const customerSchema = v.object({
  id: v.optional(uuid),
  expectedVersion: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  legalNameEn: label(200),
  legalNameAr: optionalText(200),
  taxNumber: optionalText(40),
  commercialRegistry: optionalText(40),
  address: optionalText(500),
  country: v.pipe(v.string(), v.trim(), v.toUpperCase(), v.regex(/^[A-Z]{2}$/)),
  currency: v.picklist(CURRENCIES),
  reason: label(500),
});
export type CustomerInput = v.InferOutput<typeof customerSchema>;

export const contactSchema = v.pipe(
  v.object({
    customerId: uuid,
    id: v.optional(uuid),
    name: label(200),
    email: v.pipe(
      v.string(),
      v.trim(),
      v.toLowerCase(),
      v.maxLength(254),
      v.transform((value) => value || null),
      v.nullable(v.pipe(v.string(), v.email())),
    ),
    phone: optionalText(40),
    roles: v.pipe(v.array(v.picklist(CONTACT_ROLES)), v.minLength(1)),
    locale: v.picklist(["en", "ar"]),
  }),
  v.check(
    (input) => input.email !== null || input.phone !== null,
    "Give an email address or a phone number.",
  ),
);
export type ContactInput = v.InferOutput<typeof contactSchema>;

/** A subscription's terms: a trial's end, or a term and how it bills and renews. */
export const subscriptionTermsSchema = v.pipe(
  v.object({
    state: v.picklist(["trial", "active"]),
    termStartsOn: v.nullable(isoDay),
    termEndsOn: v.nullable(isoDay),
    trialEndsOn: v.nullable(isoDay),
    renewal: v.picklist(["auto", "manual"]),
    schedule: v.picklist(BILLING_SCHEDULES),
    contractedStudents: v.nullable(
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1_000_000)),
    ),
    censusOn: v.nullable(isoDay),
    /** What the schools' administrators are shown about the contract. */
    notice: v.optional(v.nullable(v.picklist(SCHOOL_NOTICES)), null),
  }),
  v.check(
    (input) =>
      input.state === "trial"
        ? input.trialEndsOn !== null
        : input.termStartsOn !== null &&
          input.termEndsOn !== null &&
          input.termEndsOn > input.termStartsOn,
    "A trial needs its end; a contract needs a term that ends after it starts.",
  ),
);
export type SubscriptionTerms = v.InferOutput<typeof subscriptionTermsSchema>;

export const subscriptionItemSchema = v.pipe(
  v.object({
    subscriptionId: uuid,
    planVersionId: v.nullable(uuid),
    addOnVersionId: v.nullable(uuid),
    quantity: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(1_000_000),
    ),
    unitPriceMinor: money,
    discountPercent: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
    schoolIds: v.pipe(v.array(uuid), v.maxLength(50)),
    startsOn: isoDay,
    reason: label(500),
  }),
  v.check(
    (input) =>
      (input.planVersionId === null) !== (input.addOnVersionId === null),
    "An item is a plan or an add-on.",
  ),
);
export type SubscriptionItemInput = v.InferOutput<
  typeof subscriptionItemSchema
>;

export const overrideSchema = v.pipe(
  v.object({
    subscriptionId: uuid,
    schoolId: v.nullable(uuid),
    module: v.nullable(v.picklist(MODULE_IDS)),
    granted: v.nullable(v.boolean()),
    limitKey: v.nullable(v.picklist(LIMIT_KEYS)),
    value: limitValue,
    startsOn: isoDay,
    endsOn: v.nullable(isoDay),
    reason: label(500),
  }),
  v.check(
    (input) =>
      (input.module !== null &&
        input.granted !== null &&
        input.limitKey === null) ||
      (input.module === null &&
        input.granted === null &&
        input.limitKey !== null),
    "An override gives or takes a module, or sets a limit.",
  ),
  v.check(
    (input) =>
      input.limitKey === null ||
      !(STORAGE_KEYS as readonly string[]).includes(input.limitKey) ||
      (input.value !== null && input.value > 0),
    "Storage always has a size.",
  ),
  v.check(
    (input) => input.endsOn === null || input.endsOn > input.startsOn,
    "An override ends after it starts.",
  ),
);
export type OverrideInput = v.InferOutput<typeof overrideSchema>;

/** Ends items or overrides from a day, scheduled or at once. */
export const endPartsSchema = v.object({
  subscriptionId: uuid,
  part: v.picklist(["item", "override"]),
  ids: v.pipe(v.array(uuid), v.minLength(1), v.maxLength(500)),
  endsOn: isoDay,
  reason: label(500),
});
export type EndPartsInput = v.InferOutput<typeof endPartsSchema>;
