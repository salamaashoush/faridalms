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

/** Someone the office calls about a learner, as their summary shows them. */
export interface EmergencyContact {
  id: string;
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  relation: { labelEn: string | null; labelAr: string | null } | null;
  phone: string | null;
  phoneLabel: string | null;
}

/**
 * A module that knows a learner's emergency contacts, and which contact a
 * requested change to a phone is about.
 */
export interface EmergencyContacts {
  contactsOf(
    context: UnitContext,
    studentId: string,
  ): Promise<EmergencyContact[]>;
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

export const emergencyContacts = point<EmergencyContacts>("emergency contacts");

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

/** The learner's emergency contacts, in the order the office calls them; none without a module that keeps them. */
export async function contactsOf(context: UnitContext, studentId: string) {
  const found = await Promise.all(
    (await contributionsTo(context, emergencyContacts)).map((contacts) =>
      contacts.contactsOf(context, studentId),
    ),
  );
  return found.flat();
}

/** The module that keeps emergency contacts, where one is on. */
export async function contactKeeper(context: UnitContext) {
  return (await contributionsTo(context, emergencyContacts))[0] ?? null;
}
