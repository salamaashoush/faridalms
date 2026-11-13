import type { EmergencyContactRow } from "@faridalms/database/stores/emergency-contacts";

import { emergencyContactsOf as ownContactsOf } from "@faridalms/database/stores/emergency-contacts";
import { inCallingOrder } from "@faridalms/domain/emergency-contacts";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/** Someone a module marks to be called about a learner, a person the school knows. */
export interface MarkedEmergencyContact {
  id: string;
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  relation: { labelEn: string | null; labelAr: string | null } | null;
  phone: string | null;
  phoneLabel: string | null;
  /** The place in the order of calling, if the module gives one. */
  order: number | null;
}

/** A module that marks people it knows as a learner's emergency contacts. */
export interface MarkedEmergencyContacts {
  contactsOf(
    context: UnitContext,
    studentId: string,
  ): Promise<MarkedEmergencyContact[]>;
}

export const markedEmergencyContacts = point<MarkedEmergencyContacts>(
  "marked emergency contacts",
);

/**
 * One of the learner's emergency contacts as the school calls them: their
 * own (`own`), kept here and changed here, or one a module marks, changed
 * where that module keeps it.
 */
export interface EmergencyContact {
  id: string;
  own: boolean;
  version: number | null;
  userId: string | null;
  fullNameEn: string | null;
  fullNameAr: string | null;
  relation: { labelEn: string | null; labelAr: string | null } | null;
  phone: string | null;
  phoneLabel: string | null;
  otherPhone: string | null;
  email: string | null;
  notes: string | null;
  order: number | null;
}

function ownContact(row: EmergencyContactRow): EmergencyContact {
  return {
    id: row.id,
    own: true,
    version: row.version,
    userId: null,
    fullNameEn: row.name,
    fullNameAr: row.name,
    relation: row.relationship
      ? { labelEn: row.relationship, labelAr: row.relationship }
      : null,
    phone: row.phone,
    phoneLabel: null,
    otherPhone: row.otherPhone,
    email: row.email,
    notes: row.notes,
    order: row.callOrder,
  };
}

/**
 * The learner's emergency contacts in the order the school calls them:
 * their own and those the modules on mark, in one list. It checks no
 * access; its callers do.
 */
export async function emergencyContactsOf(
  context: UnitContext,
  studentId: string,
): Promise<EmergencyContact[]> {
  const [own, marked] = await Promise.all([
    ownContactsOf(context.tx, {
      tenantId: context.tenantId,
      userId: studentId,
    }),
    Promise.all(
      (await contributionsTo(context, markedEmergencyContacts)).map(
        (contribution) => contribution.contactsOf(context, studentId),
      ),
    ),
  ]);
  return inCallingOrder([
    ...own.map(ownContact),
    ...marked.flat().map((contact): EmergencyContact => ({
      id: contact.id,
      own: false,
      version: null,
      userId: contact.userId,
      fullNameEn: contact.fullNameEn,
      fullNameAr: contact.fullNameAr,
      relation: contact.relation,
      phone: contact.phone,
      phoneLabel: contact.phoneLabel,
      otherPhone: null,
      email: null,
      notes: null,
      order: contact.order,
    })),
  ]);
}
