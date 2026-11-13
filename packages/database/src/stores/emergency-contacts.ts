import { and, asc, eq } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { emergencyContacts } from "../tables/people";

type Tx = CellTransaction;

export interface EmergencyContactRow {
  id: string;
  version: number;
  name: string;
  relationship: string | null;
  phone: string;
  otherPhone: string | null;
  email: string | null;
  callOrder: number;
  notes: string | null;
}

export interface EmergencyContactFields {
  name: string;
  relationship: string | null;
  phone: string;
  otherPhone: string | null;
  email: string | null;
  callOrder: number;
  notes: string | null;
}

const columns = {
  id: emergencyContacts.id,
  version: emergencyContacts.version,
  name: emergencyContacts.name,
  relationship: emergencyContacts.relationship,
  phone: emergencyContacts.phone,
  otherPhone: emergencyContacts.otherPhone,
  email: emergencyContacts.email,
  callOrder: emergencyContacts.callOrder,
  notes: emergencyContacts.notes,
};

/** The person's own emergency contacts, in the order they are called. */
export async function emergencyContactsOf(
  tx: Tx,
  input: { tenantId: string; userId: string },
): Promise<EmergencyContactRow[]> {
  return tx
    .select(columns)
    .from(emergencyContacts)
    .where(
      and(
        eq(emergencyContacts.tenantId, input.tenantId),
        eq(emergencyContacts.userId, input.userId),
        eq(emergencyContacts.status, "active"),
      ),
    )
    .orderBy(
      asc(emergencyContacts.callOrder),
      asc(emergencyContacts.name),
      asc(emergencyContacts.createdAt),
    );
}

export async function insertEmergencyContact(
  tx: Tx,
  input: { tenantId: string; userId: string } & EmergencyContactFields,
): Promise<EmergencyContactRow> {
  const [row] = await tx
    .insert(emergencyContacts)
    .values(input)
    .returning(columns);
  if (!row) throw new Error("the emergency contact was not kept");
  return row;
}

/** Changes one of the person's contacts from the version read; null when it moved on or is not theirs. */
export async function updateEmergencyContact(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    id: string;
    expectedVersion: number;
  } & EmergencyContactFields,
): Promise<EmergencyContactRow | null> {
  const { tenantId, userId, id, expectedVersion, ...fields } = input;
  const [row] = await tx
    .update(emergencyContacts)
    .set(fields)
    .where(
      and(
        eq(emergencyContacts.tenantId, tenantId),
        eq(emergencyContacts.userId, userId),
        eq(emergencyContacts.id, id),
        eq(emergencyContacts.status, "active"),
        eq(emergencyContacts.version, expectedVersion),
      ),
    )
    .returning(columns);
  return row ?? null;
}

/** Tombstones one of the person's contacts at the version read; null when it moved on or is not theirs. */
export async function removeEmergencyContact(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    id: string;
    expectedVersion: number;
  },
): Promise<{ id: string } | null> {
  const [row] = await tx
    .update(emergencyContacts)
    .set({ status: "tobedeleted" })
    .where(
      and(
        eq(emergencyContacts.tenantId, input.tenantId),
        eq(emergencyContacts.userId, input.userId),
        eq(emergencyContacts.id, input.id),
        eq(emergencyContacts.status, "active"),
        eq(emergencyContacts.version, input.expectedVersion),
      ),
    )
    .returning({ id: emergencyContacts.id });
  return row ?? null;
}
