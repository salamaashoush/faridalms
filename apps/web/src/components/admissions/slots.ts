import type { LetterField } from "@faridalms/domain/admissions";
import type { Facet } from "@faridalms/ui/system/index-toolbar";
import type { ComponentType } from "react";

import type { ViewValue } from "~/components/classes/slots";
import type { applicationQuery } from "~/queries/admissions";
import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

import type { ApplicationAnswers, ApplicationDraft } from "./apply-parts";

export interface IntakePartFieldProps {
  read: unknown;
  value: unknown;
  /** The day the intake's learners start, which a part may hold within its own days. */
  startsOn: string;
  /** The intake is saved, so a value the part already holds no longer changes. */
  fixed: boolean;
  onChange: (value: unknown) => void;
}

/**
 * What a module keeps about an intake, chosen on its form under the
 * module's key and named in lists and letters: the year it admits into,
 * say. Methods, so each module types what it reads.
 */
export interface IntakePart {
  key: string;
  /** The part as a field, a column and a letter field name it. */
  label: () => string;
  /** What `{key}` in a letter becomes. */
  letterHint: () => string;
  query(): SlotQuery<unknown>;
  initial(
    read: unknown,
    search: Readonly<Record<string, unknown>>,
  ): { value: unknown; startsOn?: string };
  /** The words the part adds to a new intake's name, in each language. */
  titleOf(read: unknown, value: unknown): { en: string; ar: string } | null;
  /** What a new value suggests for the rest of the form: the day learners start, the ages it takes. */
  suggest?(
    read: unknown,
    value: unknown,
  ): {
    startsOn?: string;
    ages?: { minMonths: number | null; maxMonths: number | null };
  };
  Field: ComponentType<IntakePartFieldProps>;
}

export const intakeParts = slot<IntakePart>("intake parts");

/**
 * A view of the school's intakes a module offers on the admissions lists,
 * kept in the address under its key: the year admissions are for, say.
 */
export interface IntakeFilter {
  key: string;
  query(): SlotQuery<unknown>;
  facetOf(
    read: unknown,
    value: ViewValue,
    onChange: (value: ViewValue) => void,
  ): Facet | null;
}

export const intakeFilters = slot<IntakeFilter>("intake filters");

export type ApplicationRecord = Awaited<
  ReturnType<NonNullable<ReturnType<typeof applicationQuery>["queryFn"]>>
>;

export interface ApplicationContactProps {
  row: ApplicationRecord;
}

/**
 * Who sent an application and how to reach them, as a module that lets
 * someone apply for another person shows it, with that person's relation
 * to the applicant.
 */
export const applicationContacts = slot<ComponentType<ApplicationContactProps>>(
  "application contacts",
);

export interface ApplicationStepProps {
  form: ApplicationAnswers;
  onChange: (form: ApplicationAnswers) => void;
  options: ApplicationDraft["options"];
  tried: boolean;
}

/**
 * A step a module adds to the application form, after the step it names:
 * who the person applying is to the applicant, say.
 */
export interface ApplicationStep {
  id: string;
  after: string;
  label: () => string;
  valid(form: ApplicationAnswers): boolean;
  Step: ComponentType<ApplicationStepProps>;
}

export const applicationSteps = slot<ApplicationStep>("application steps");

/** What else enrolling an applicant does, as a module adds it to the list the office reads first. */
export const enrolNotes = slot<() => string>("enrol notes");

/** Present where a module places learners by grade, so the form asks each earlier school's grade. */
export const previousSchoolGrades = slot<true>("previous school grades");

/**
 * The field a letter names the person who applied by, where a module knows
 * them as more than the applicant: the family, say.
 */
export const appliedField = slot<LetterField>("applied field");
