import type { ApplicationForm } from "@faridalms/domain/admissions";
import type { PartValue, Views } from "@faridalms/domain/classes";

import { ORPCError } from "@orpc/server";

import type { ViewValue } from "../classes/points";
import type { UnitContext } from "../core/context";
import type { ModuleScope } from "../core/extension";

import { contributionsTo, point } from "../core/extension";

/** What a module keeps about an intake, as a list and a letter name it. */
export interface IntakeFact {
  /** The part's value, as its own schema reads it, for the intake's form. */
  value: PartValue;
  labelEn: string | null;
  labelAr: string | null;
  /** Where the intake sits among others by this part: its grade's order, say. */
  rank: number;
}

/**
 * What a module keeps about an intake, saved with it from its form under
 * the module's key, and read back under the same key for lists, letters and
 * the website: the year it admits into, say.
 */
export interface IntakePart {
  key: string;
  save(
    context: UnitContext,
    input: { intakeId: string; startsOn: string; value: unknown },
  ): Promise<void>;
  factsOf(
    context: ModuleScope,
    intakeIds: readonly string[],
  ): Promise<Map<string, IntakeFact>>;
}

export const intakeParts = point<IntakePart>("intake parts");

/** Saves what the modules keep about an intake; a part no module on answers for is refused. */
export async function saveIntakeParts(
  context: UnitContext,
  input: {
    intakeId: string;
    startsOn: string;
    parts: Readonly<Record<string, unknown>>;
  },
) {
  const offered = await contributionsTo(context, intakeParts);
  for (const key of Object.keys(input.parts))
    if (!offered.some((part) => part.key === key))
      throw new ORPCError("BAD_REQUEST", { message: "intake.part_unknown" });
  for (const part of offered)
    if (part.key in input.parts)
      await part.save(context, {
        intakeId: input.intakeId,
        startsOn: input.startsOn,
        value: input.parts[part.key],
      });
}

export type IntakeFacts = Record<string, IntakeFact>;

/** What each module keeps about each intake, by intake and key. */
export async function intakeFactsOf(
  context: ModuleScope,
  intakeIds: readonly string[],
): Promise<Map<string, IntakeFacts>> {
  const result = new Map<string, IntakeFacts>(intakeIds.map((id) => [id, {}]));
  if (intakeIds.length === 0) return result;
  for (const part of await contributionsTo(context, intakeParts))
    for (const [id, fact] of await part.factsOf(context, intakeIds)) {
      const facts = result.get(id);
      if (facts) facts[part.key] = fact;
    }
  return result;
}

/**
 * Intakes with what the modules keep about each, as listed, except that
 * intakes starting the same day follow the facts' ranks in turn.
 */
export async function withIntakeFacts<
  T extends { id: string; startsOn: string },
>(
  context: ModuleScope,
  rows: readonly T[],
): Promise<(T & { facts: IntakeFacts })[]> {
  const facts = await intakeFactsOf(
    context,
    rows.map((row) => row.id),
  );
  const ranks = (id: string) =>
    Object.values(facts.get(id) ?? {}).map((fact) => fact.rank);
  return rows
    .map((row, index) => ({ row, index }))
    .toSorted((a, b) => {
      if (a.row.startsOn !== b.row.startsOn) return a.index - b.index;
      const left = ranks(a.row.id);
      const right = ranks(b.row.id);
      for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
        const difference = (left[i] ?? 0) - (right[i] ?? 0);
        if (difference !== 0) return difference;
      }
      return a.index - b.index;
    })
    .map(({ row }) => ({ ...row, facts: facts.get(row.id) ?? {} }));
}

/**
 * A view of the school's intakes a module offers under its key, such as a
 * year's. Given no value it applies its default, or none.
 */
export interface IntakeView {
  key: string;
  select(
    context: UnitContext,
    value: ViewValue,
  ): Promise<{
    intakeIds: string[];
    title?: { titleEn: string | null; titleAr: string | null };
  } | null>;
}

export const intakeViews = point<IntakeView>("intake views");

/** The intakes a module's view narrows a list to, or null for every intake; a key no module on answers for is refused. */
export async function intakeViewOf(context: UnitContext, views: Views) {
  const offered = await contributionsTo(context, intakeViews);
  if (Object.keys(views).some((key) => !offered.some((v) => v.key === key)))
    throw new ORPCError("BAD_REQUEST", { message: "intake.view_unknown" });
  for (const view of offered) {
    const selected = await view.select(context, views[view.key] ?? null);
    if (selected) return selected;
  }
  return null;
}

/** What a module records when an accepted applicant is enrolled from an intake. */
export interface EnrolmentPart {
  enrolled(
    context: UnitContext,
    input: {
      intakeId: string;
      studentId: string;
      startsOn: string;
      /** How the child came: first enrolment, transfer in or re-entry. */
      entry: string;
      previousSchool: string | null;
      applicationId: string;
    },
  ): Promise<void>;
}

export const enrolmentParts = point<EnrolmentPart>("enrolment parts");

/** Records each module's part of an enrolment. */
export async function enrolParts(
  context: UnitContext,
  input: Parameters<EnrolmentPart["enrolled"]>[1],
) {
  for (const part of await contributionsTo(context, enrolmentParts))
    await part.enrolled(context, input);
}

/**
 * A module that lets someone apply for another person: what sending such
 * an application links, the applicant's brothers and sisters at the school,
 * and what follows the applicant onto a student they turn out to be.
 */
export interface FilingForOthers {
  /**
   * Links the filer, and anyone else the form names, to the applicant as
   * the application is sent; answers the filer's link, which their consents
   * are given through.
   */
  sent(
    context: UnitContext,
    input: { applicantId: string; form: ApplicationForm },
  ): Promise<{ linkId: string; otherId: string | null }>;
  /** Current students who share a parent with any of these people. */
  relatives(
    context: UnitContext,
    parentIds: readonly string[],
  ): Promise<{ id: string; nameEn: string | null; nameAr: string | null }[]>;
  /** Moves what links people to the applicant onto the student they are. */
  joined(
    context: UnitContext,
    input: { fromId: string; toId: string; consentIds: readonly string[] },
  ): Promise<void>;
}

export const filingForOthers = point<FilingForOthers>("filing for others");

/** The module that lets someone apply for another person, where one is on. */
export async function filingModule(context: UnitContext) {
  return (await contributionsTo(context, filingForOthers))[0] ?? null;
}
