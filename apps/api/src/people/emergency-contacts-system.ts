import type { EmergencyContactRow } from "@faridalms/database/stores/emergency-contacts";

import {
  emergencyContactsOf as ownContactsOf,
  insertEmergencyContact,
  removeEmergencyContact as tombstoneEmergencyContact,
  updateEmergencyContact,
} from "@faridalms/database/stores/emergency-contacts";
import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  removeEmergencyContactSchema,
  saveEmergencyContactSchema,
} from "@faridalms/domain/emergency-contacts";
import { toE164 } from "@faridalms/domain/phone";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { audit, can, readProcedure, writeProcedure } from "../core/procedure";
import { isStaff, reachesStudent, requireStudent } from "../core/reach";
import { decidesFor } from "./acting";
import { emergencyContactsOf } from "./emergency-contacts";

/**
 * Whether the viewer reads a learner's emergency contacts and whether they
 * change them. Staff read them as they read a student's contact details
 * and change them as they change the student; the learner reads their own
 * and changes them once they decide for themself; anyone else only as one
 * who decides for the learner. Not found for a learner none of these reach.
 */
async function accessTo(
  context: UnitContext,
  studentId: string,
): Promise<{ edits: boolean }> {
  if (
    isStaff(context) &&
    (can(context, "contacts:read") || can(context, "people:manage"))
  ) {
    await requireStudent(context, "people", studentId);
    return { edits: can(context, "people:manage") };
  }
  if (!(await reachesStudent(context, "own", studentId)))
    throw new ORPCError("NOT_FOUND");
  const decides = await decidesFor(context, {
    userId: context.actor.userId,
    studentId,
    on: context.today,
  });
  if (studentId === context.actor.userId) return { edits: decides };
  if (!decides) throw new ORPCError("NOT_FOUND");
  return { edits: true };
}

async function requireEdits(context: UnitContext, studentId: string) {
  if (!(await accessTo(context, studentId)).edits)
    throw new ORPCError("FORBIDDEN", {
      message: "emergency_contacts.not_permitted",
    });
}

const auditedOf = (row: EmergencyContactRow | null) =>
  row && {
    name: row.name,
    relationship: row.relationship,
    phone: row.phone,
    otherPhone: row.otherPhone,
    email: row.email,
    callOrder: row.callOrder,
    notes: row.notes,
  };

function phoneOf(text: string, country: string) {
  const phone = toE164(text, country);
  if (!phone)
    throw new ORPCError("BAD_REQUEST", {
      message: "contact_point.phone_invalid",
    });
  return phone;
}

export const emergencyContacts = readProcedure
  .input(v.object({ personId: v.pipe(v.string(), v.uuid()) }))
  .handler(async ({ input, context }) => {
    const access = await accessTo(context, input.personId);
    return {
      edits: access.edits,
      contacts: await emergencyContactsOf(context, input.personId),
    };
  });

/** Adds one of the learner's own emergency contacts, or changes one from the version read. */
export const saveEmergencyContact = writeProcedure
  .input(saveEmergencyContactSchema)
  .handler(async ({ input, context }) => {
    await requireEdits(context, input.personId);
    const country =
      (await schoolProfile(context.tx, context.schoolId))?.countryCode ?? "EG";
    const fields = {
      name: input.name,
      relationship: input.relationship,
      phone: phoneOf(input.phone, country),
      otherPhone: input.otherPhone ? phoneOf(input.otherPhone, country) : null,
      email: input.email || null,
      callOrder: input.callOrder,
      notes: input.notes,
    };
    const scope = { tenantId: context.tenantId, userId: input.personId };
    let before: EmergencyContactRow | null = null;
    let saved: EmergencyContactRow | null;
    if (input.id) {
      if (input.expectedVersion === undefined)
        throw new ORPCError("BAD_REQUEST", { message: "conflict.version" });
      before =
        (await ownContactsOf(context.tx, scope)).find(
          (row) => row.id === input.id,
        ) ?? null;
      if (!before) throw new ORPCError("NOT_FOUND");
      saved = await updateEmergencyContact(context.tx, {
        ...scope,
        id: input.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (!saved)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
    } else
      saved = await insertEmergencyContact(context.tx, { ...scope, ...fields });
    await audit(context, {
      action: before ? "emergency_contact.update" : "emergency_contact.create",
      objectType: "emergency_contact",
      objectId: saved.id,
      subjectUserId: input.personId,
      studentUserId: input.personId,
      change: {
        table: "core.emergency_contacts",
        before: auditedOf(before),
        after: auditedOf(saved) ?? {},
      },
    });
    return { id: saved.id, version: saved.version };
  });

/** Removes one of the learner's own emergency contacts at the version read. */
export const removeEmergencyContact = writeProcedure
  .input(removeEmergencyContactSchema)
  .handler(async ({ input, context }) => {
    await requireEdits(context, input.personId);
    const scope = { tenantId: context.tenantId, userId: input.personId };
    const before = (await ownContactsOf(context.tx, scope)).find(
      (row) => row.id === input.id,
    );
    if (!before) throw new ORPCError("NOT_FOUND");
    const removed = await tombstoneEmergencyContact(context.tx, {
      ...scope,
      id: input.id,
      expectedVersion: input.expectedVersion,
    });
    if (!removed)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "emergency_contact.remove",
      objectType: "emergency_contact",
      objectId: input.id,
      subjectUserId: input.personId,
      studentUserId: input.personId,
      change: {
        table: "core.emergency_contacts",
        before: auditedOf(before),
        after: {},
      },
    });
    return { removed: true };
  });
