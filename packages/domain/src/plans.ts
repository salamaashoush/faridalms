import * as v from "valibot";

/** The parts of the product a plan may include, turned on per school. */
export const SCHOOL_MODULES = [
  "elearning",
  "early_years",
  "video",
  "coding",
] as const;
export type SchoolModule = (typeof SCHOOL_MODULES)[number];

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

export interface SchoolPlan {
  poolBytes: number | null;
  classBytes: number | null;
  moduleBytes: number | null;
  personBytes: number | null;
  /** Null when the plan names none: every module is available. */
  modules: string[] | null;
}

export function limitsOf(plan: SchoolPlan | null): StorageLimits {
  return {
    poolBytes: plan?.poolBytes ?? DEFAULT_LIMITS.poolBytes,
    classBytes: plan?.classBytes ?? DEFAULT_LIMITS.classBytes,
    moduleBytes: plan?.moduleBytes ?? DEFAULT_LIMITS.moduleBytes,
    personBytes: plan?.personBytes ?? DEFAULT_LIMITS.personBytes,
  };
}

export function availableModules(plan: SchoolPlan | null): SchoolModule[] {
  const named = plan?.modules;
  return named
    ? SCHOOL_MODULES.filter((module) => named.includes(module))
    : [...SCHOOL_MODULES];
}

const bytes = v.nullable(
  v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2 ** 50)),
);

export const schoolPlanSchema = v.object({
  poolBytes: bytes,
  classBytes: bytes,
  moduleBytes: bytes,
  personBytes: bytes,
  modules: v.nullable(v.array(v.picklist(SCHOOL_MODULES))),
});

/** A plan as the operator console sets it, with the reason the change log keeps. */
export const savePlanSchema = v.object({
  schoolId: v.pipe(v.string(), v.uuid()),
  ...schoolPlanSchema.entries,
  reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});
