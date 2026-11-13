import type { SummaryReader } from "@faridalms/database/stores/records";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/**
 * A module that lets someone besides the learner and the health staff read
 * a learner's medical summary: the rule it reads by, checked in the same
 * statement as every read and every change asked for, or null when the
 * module gives the viewer no reading of that learner.
 */
export interface SummaryReaders {
  readerOf(
    context: UnitContext,
    studentId: string,
  ): Promise<SummaryReader | null>;
}

export const summaryReaders = point<SummaryReaders>("summary readers");

/**
 * A module that keeps which of the emergency contacts it marks a requested
 * change to a phone is about.
 */
export interface ContactChanges {
  keepChange(
    context: UnitContext,
    tx: UnitContext["tx"],
    input: { changeId: string; contactId: string },
  ): Promise<void>;
  changesOf(
    context: UnitContext,
    tx: UnitContext["tx"],
    changeIds: readonly string[],
  ): Promise<Map<string, string>>;
}

export const contactChanges = point<ContactChanges>("contact changes");

/** The rule a module lets the viewer read the learner's summary by, if any does. */
export async function moduleReaderOf(
  context: UnitContext,
  studentId: string,
): Promise<SummaryReader | null> {
  for (const readers of await contributionsTo(context, summaryReaders)) {
    const reader = await readers.readerOf(context, studentId);
    if (reader) return reader;
  }
  return null;
}

/** The module that keeps changes asked to the contacts it marks, where one is on. */
export async function contactKeeper(context: UnitContext) {
  return (await contributionsTo(context, contactChanges))[0] ?? null;
}
