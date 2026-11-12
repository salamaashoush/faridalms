import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/** A period of a day a register is taken in, at that day's times. */
export interface RegisterPeriod {
  id: string;
  code: string;
  nameEn: string | null;
  nameAr: string | null;
  sequence: number;
  kind: "lesson" | "registration";
  startTime: string | null;
  endTime: string | null;
  /** A register taken in it counts as the day's attendance. */
  official: boolean;
}

/**
 * What a module that plans the school's days tells registers: the periods
 * a day holds, the lessons that owe a register, the period each register
 * was taken in, and who covers a lesson. Where none is on, every register
 * is a class's register of the whole day.
 */
export interface RegisterPlan {
  /** The periods registers are taken in on a day, in the order of the day; none where it holds none. */
  periodsOn(context: UnitContext, day: string): Promise<RegisterPeriod[]>;
  /** The registers a day's lessons owe, by class and period. */
  lessonsOn(
    context: UnitContext,
    day: string,
  ): Promise<{ classId: string; periodId: string }[]>;
  /** The period each register was taken in, for those taken in one. */
  periodsOf(
    context: UnitContext,
    registerIds: readonly string[],
  ): Promise<Map<string, RegisterPeriod>>;
  /** The lessons someone covers on a day, whose registers they take then. */
  coveredOn(
    context: UnitContext,
    input: { userId: string; day: string },
  ): Promise<{ classId: string; periodId: string }[]>;
  /** The register a class has in a period of a day, or null. */
  registerIn(
    context: UnitContext,
    input: { classId: string; day: string; periodId: string },
  ): Promise<string | null>;
  /** Records the period a register opened just now is taken in. */
  takenIn(
    context: UnitContext,
    input: {
      registerId: string;
      classId: string;
      day: string;
      periodId: string;
    },
  ): Promise<void>;
}

export const registerPlans = point<RegisterPlan>("register plans");

async function planOf(context: UnitContext): Promise<RegisterPlan | null> {
  const [plan] = await contributionsTo(context, registerPlans);
  return plan ?? null;
}

export async function periodsOn(
  context: UnitContext,
  day: string,
): Promise<RegisterPeriod[]> {
  return (await (await planOf(context))?.periodsOn(context, day)) ?? [];
}

export async function lessonsOn(
  context: UnitContext,
  day: string,
): Promise<{ classId: string; periodId: string }[]> {
  return (await (await planOf(context))?.lessonsOn(context, day)) ?? [];
}

export async function periodsOf(
  context: UnitContext,
  registerIds: readonly string[],
): Promise<Map<string, RegisterPeriod>> {
  const plan = await planOf(context);
  if (!plan || registerIds.length === 0) return new Map();
  return plan.periodsOf(context, [...new Set(registerIds)]);
}

export async function coveredOn(
  context: UnitContext,
  input: { userId: string; day: string },
): Promise<{ classId: string; periodId: string }[]> {
  return (await (await planOf(context))?.coveredOn(context, input)) ?? [];
}

export async function registerIn(
  context: UnitContext,
  input: { classId: string; day: string; periodId: string },
): Promise<string | null> {
  return (await (await planOf(context))?.registerIn(context, input)) ?? null;
}

export async function takenIn(
  context: UnitContext,
  input: { registerId: string; classId: string; day: string; periodId: string },
): Promise<void> {
  const plan = await planOf(context);
  if (!plan)
    throw new ORPCError("BAD_REQUEST", { message: "attendance.no_period" });
  await plan.takenIn(context, input);
}
