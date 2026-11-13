import * as v from "valibot";

import type { ModuleId } from "./modules";

import { BASIC_MODULES, MODULE_IDS } from "./modules";

const GIB = 1024 * 1024 * 1024;
const MIB = 1024 * 1024;

/**
 * Storage a school starts with: a pool for everything, and caps that keep one
 * class, module or person from taking it all. Hand-ins to open work are
 * never refused, only counted.
 */
export const DEFAULT_LIMITS = {
  poolBytes: 100 * GIB,
  classBytes: GIB,
  moduleBytes: GIB,
  personBytes: 500 * MIB,
} as const;
export type StorageLimits = {
  -readonly [K in keyof typeof DEFAULT_LIMITS]: number;
};

/** Past this share of a limit, the people who fill it are warned. */
export const WARN_SHARE = 0.8;

/** How far a school may use the platform; the lifecycle sets anything but full. */
export const SCHOOL_ACCESS = ["full", "restricted", "read_only"] as const;
export type SchoolAccess = (typeof SCHOOL_ACCESS)[number];

/** What the portal tells a school's administrators about their contract. */
export const SCHOOL_NOTICES = ["payment_overdue", "plan_ends_soon"] as const;
export type SchoolNotice = (typeof SCHOOL_NOTICES)[number];

/**
 * What a school is entitled to, as the directory publishes it. Storage is
 * always a number, since every quota screen shows a share of it; the other
 * limits are null when unlimited.
 */
export interface SchoolEntitlements {
  modules: ModuleId[];
  poolBytes: number;
  classBytes: number;
  moduleBytes: number;
  personBytes: number;
  /** Soft: past it administrators are told, and enrolling is never refused. */
  students: number | null;
  /** Soft, as students. */
  staffAccounts: number | null;
  /** Hard at upload: a video past it plays as uploaded and is not streamed. */
  videoHours: number | null;
  /** Hard: hosts a school may add. */
  customDomains: number | null;
  /** Soft: catches a runaway sender. */
  emailPerMonth: number | null;
  captionMinutes: number | null;
  access: SchoolAccess;
  trialEndsOn: string | null;
  notice: SchoolNotice | null;
  revision: number;
}

/**
 * A school the directory holds no entitlements for: Basic and the default
 * storage. The console writes a row for every school it creates, so this is
 * for schools made from the shell and for self-hosted deployments.
 */
export const BASIC_ENTITLEMENTS: SchoolEntitlements = {
  modules: [...BASIC_MODULES],
  ...DEFAULT_LIMITS,
  students: null,
  staffAccounts: null,
  videoHours: null,
  customDomains: null,
  emailPerMonth: null,
  captionMinutes: null,
  access: "full",
  trialEndsOn: null,
  notice: null,
  revision: 0,
};

export function limitsOf(entitlements: SchoolEntitlements): StorageLimits {
  return {
    poolBytes: entitlements.poolBytes,
    classBytes: entitlements.classBytes,
    moduleBytes: entitlements.moduleBytes,
    personBytes: entitlements.personBytes,
  };
}

export function availableModules(entitlements: SchoolEntitlements): ModuleId[] {
  return MODULE_IDS.filter((module) => entitlements.modules.includes(module));
}

/** The modules on offer, given those the operator took off it; any other is on offer. */
export function offeredModules(withheld: readonly string[]): ModuleId[] {
  const off = new Set<string>(withheld);
  return MODULE_IDS.filter((module) => !off.has(module));
}

/**
 * The modules a school's plan card lists: every one it has, then those on
 * offer that it could ask about. One neither held nor offered is not named.
 */
export function cardModules(input: {
  modules: readonly ModuleId[];
  has: (module: ModuleId) => boolean;
  offered: readonly ModuleId[];
}): ModuleId[] {
  const offered = new Set<ModuleId>(input.offered);
  return input.modules.filter(
    (module) => input.has(module) || offered.has(module),
  );
}

/** An operator puts a module on offer to schools that lack it, or takes it off, saying why. */
export const setOfferSchema = v.object({
  module: v.picklist(MODULE_IDS),
  offered: v.boolean(),
  reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});

const bytes = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(2 ** 50),
);
const limit = v.nullable(
  v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000_000)),
);

/** What an operator sets; access and the revision are the platform's. */
export const entitlementsSchema = v.object({
  modules: v.array(v.picklist(MODULE_IDS)),
  poolBytes: bytes,
  classBytes: bytes,
  moduleBytes: bytes,
  personBytes: bytes,
  students: limit,
  staffAccounts: limit,
  videoHours: limit,
  customDomains: limit,
  emailPerMonth: limit,
  captionMinutes: limit,
  trialEndsOn: v.nullable(v.pipe(v.string(), v.isoDate())),
  notice: v.nullable(v.picklist(SCHOOL_NOTICES)),
});
export type EntitlementsInput = v.InferOutput<typeof entitlementsSchema>;

/** The part of a school's entitlements an operator sets. */
export function settableOf({
  access: _access,
  revision: _revision,
  ...settable
}: SchoolEntitlements): EntitlementsInput {
  return settable;
}

/** Entitlements as the operator console sets them, with the reason the change log keeps. */
export const saveEntitlementsSchema = v.object({
  schoolId: v.pipe(v.string(), v.uuid()),
  ...entitlementsSchema.entries,
  reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});
