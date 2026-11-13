import { emergencyContactsOf as ownContactsOf } from "@faridalms/database/stores/emergency-contacts";
import { contactsOf } from "@faridalms/database/stores/persons";
import { person } from "@faridalms/database/stores/students";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";
import { decidingLearners } from "./acting";

/**
 * Someone the school may contact about a learner: the learner themself,
 * one of their own emergency contacts, or a person a module lets the
 * school call for them.
 */
export interface Contactable {
  studentId: string;
  kind: "self" | "emergency" | "actor";
  /** The person, or the emergency contact's own row. */
  id: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  relationEn: string | null;
  relationAr: string | null;
  phone: string | null;
  email: string | null;
  /** Marked to be called in an emergency. */
  emergency: boolean;
}

/**
 * A module that knows whom the school may call for a learner on a day, by
 * its own rules of who may be contacted, in the order it gives.
 */
export interface CallableActors {
  callableOf(
    context: UnitContext,
    input: { studentIds: readonly string[]; on: string },
  ): Promise<Omit<Contactable, "kind" | "email">[]>;
}

export const callableActors = point<CallableActors>("callable actors");

/**
 * Whom the school may contact about each learner on a day, in order: the
 * learner where they decide for themself, at the phone and email on their
 * record; then their own emergency contacts; then those the modules on let
 * the school call. It checks no access; its callers do.
 */
export async function contactableFor(
  context: UnitContext,
  input: { studentIds: readonly string[]; on: string },
): Promise<Contactable[]> {
  if (input.studentIds.length === 0) return [];
  const [deciding, actors] = await Promise.all([
    decidingLearners(context, input.studentIds, input.on),
    Promise.all(
      (await contributionsTo(context, callableActors)).map((contribution) =>
        contribution.callableOf(context, input),
      ),
    ),
  ]);
  const found: Contactable[] = [];
  for (const studentId of input.studentIds) {
    if (deciding.has(studentId)) {
      const [self, points] = await Promise.all([
        person(context.tx, studentId),
        contactsOf(context.tx, context.tenantId, studentId),
      ]);
      const phone = points.find((row) => row.kind === "phone");
      const email = points.find((row) => row.kind === "email");
      found.push({
        studentId,
        kind: "self",
        id: studentId,
        fullNameEn: self?.fullNameEn ?? null,
        fullNameAr: self?.fullNameAr ?? null,
        relationEn: null,
        relationAr: null,
        phone: phone ? (phone.normalized ?? phone.value) : null,
        email: email?.value ?? null,
        emergency: false,
      });
    }
    for (const row of await ownContactsOf(context.tx, {
      tenantId: context.tenantId,
      userId: studentId,
    }))
      found.push({
        studentId,
        kind: "emergency",
        id: row.id,
        fullNameEn: row.name,
        fullNameAr: row.name,
        relationEn: row.relationship,
        relationAr: row.relationship,
        phone: row.phone,
        email: row.email,
        emergency: true,
      });
    for (const row of actors.flat())
      if (row.studentId === studentId)
        found.push({ ...row, kind: "actor", email: null });
  }
  return found;
}
