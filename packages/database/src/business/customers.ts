import type {
  ContactInput,
  CustomerInput,
} from "@faridalms/domain/subscriptions";

import { and, arrayContains, asc, eq, inArray, isNull, or } from "drizzle-orm";

import type { BusinessDb, BusinessTx } from "./client";

import { recordEvent } from "./events";
import { contacts, customers, subscriptions } from "./schema";

export type CustomerRow = typeof customers.$inferSelect;
export type ContactRow = typeof contacts.$inferSelect;

export function listCustomers(db: BusinessDb): Promise<CustomerRow[]> {
  return db.select().from(customers).orderBy(asc(customers.legalNameEn));
}

/** A customer with its active contacts and every subscription it has held. */
export async function customerById(db: BusinessDb, id: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id));
  if (!customer) return null;
  const [people, held] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.customerId, id), eq(contacts.status, "active")))
      .orderBy(asc(contacts.name)),
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, id))
      .orderBy(asc(subscriptions.createdAt)),
  ]);
  return { customer, contacts: people, subscriptions: held };
}

/** The active billing contacts of the customers given, by name. */
export function billingContactsOf(
  db: BusinessDb,
  customerIds: readonly string[],
): Promise<ContactRow[]> {
  if (customerIds.length === 0) return Promise.resolve([]);
  return db
    .select()
    .from(contacts)
    .where(
      and(
        inArray(contacts.customerId, [...customerIds]),
        eq(contacts.status, "active"),
        arrayContains(contacts.roles, ["billing"]),
      ),
    )
    .orderBy(asc(contacts.name));
}

export async function customerOfTenant(
  db: BusinessDb,
  tenantId: string,
): Promise<CustomerRow | null> {
  const [row] = await db
    .select()
    .from(customers)
    .where(eq(customers.tenantId, tenantId));
  return row ?? null;
}

type CustomerFields = Omit<CustomerInput, "id" | "expectedVersion" | "reason">;

/** Writes a new customer in the caller's transaction, and logs it. */
export async function insertCustomer(
  tx: BusinessTx,
  input: CustomerFields & {
    tenantId: string | null;
    accountOwnerId?: string | null;
    by: string;
    reason: string;
  },
): Promise<string> {
  const { tenantId, accountOwnerId = null, by, reason, ...fields } = input;
  const [created] = await tx
    .insert(customers)
    .values({ ...fields, tenantId, accountOwnerId })
    .returning({ id: customers.id });
  if (!created) throw new Error("customer was not created");
  await recordEvent(tx, {
    operatorId: by,
    action: "customer.create",
    subjectType: "customer",
    subjectId: created.id,
    after: fields,
    reason,
  });
  return created.id;
}

/**
 * Creates a customer, or changes one if nobody changed it since it was read.
 * Answers its id, or null on a stale save.
 */
export async function saveCustomer(
  db: BusinessDb,
  input: CustomerInput & { by: string; tenantId?: string | null },
): Promise<string | null> {
  const { id, expectedVersion, reason, by, tenantId, ...fields } = input;
  return db.transaction(async (tx) => {
    if (!id)
      return insertCustomer(tx, {
        ...fields,
        tenantId: tenantId ?? null,
        by,
        reason,
      });
    const [before] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .for("update");
    if (!before || before.version !== expectedVersion) return null;
    await tx
      .update(customers)
      .set({ ...fields, version: before.version + 1 })
      .where(eq(customers.id, id));
    await recordEvent(tx, {
      operatorId: by,
      action: "customer.update",
      subjectType: "customer",
      subjectId: id,
      before: {
        legalNameEn: before.legalNameEn,
        legalNameAr: before.legalNameAr,
        taxNumber: before.taxNumber,
        commercialRegistry: before.commercialRegistry,
        address: before.address,
        country: before.country,
        currency: before.currency,
      },
      after: fields,
      reason,
    });
    return id;
  });
}

/**
 * Records the tenant a customer runs, once its schools exist. False when
 * the customer already runs another.
 */
export async function linkTenant(
  db: BusinessDb,
  input: { customerId: string; tenantId: string; by: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [linked] = await tx
      .update(customers)
      .set({ tenantId: input.tenantId })
      .where(
        and(
          eq(customers.id, input.customerId),
          or(
            isNull(customers.tenantId),
            eq(customers.tenantId, input.tenantId),
          ),
        ),
      )
      .returning({ id: customers.id });
    if (!linked) return false;
    await recordEvent(tx, {
      operatorId: input.by,
      action: "customer.tenant",
      subjectType: "customer",
      subjectId: input.customerId,
      after: { tenantId: input.tenantId },
    });
    return true;
  });
}

/** Names the operator who looks after a customer, or nobody. */
export async function setAccountOwner(
  db: BusinessDb,
  input: { customerId: string; ownerId: string | null; by: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ ownerId: customers.accountOwnerId })
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .for("update");
    if (!before) return false;
    if (before.ownerId === input.ownerId) return true;
    await tx
      .update(customers)
      .set({ accountOwnerId: input.ownerId })
      .where(eq(customers.id, input.customerId));
    await recordEvent(tx, {
      operatorId: input.by,
      action: "customer.owner",
      subjectType: "customer",
      subjectId: input.customerId,
      before: { accountOwnerId: before.ownerId },
      after: { accountOwnerId: input.ownerId },
    });
    return true;
  });
}

/** Records the version of the terms or the data processing agreement a customer accepted. */
export async function acceptAgreement(
  db: BusinessDb,
  input: {
    customerId: string;
    agreement: "terms" | "dpa";
    version: string;
    by: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(customers)
      .set(
        input.agreement === "terms"
          ? { termsVersion: input.version, termsAcceptedAt: now }
          : { dpaVersion: input.version, dpaAcceptedAt: now },
      )
      .where(eq(customers.id, input.customerId));
    await recordEvent(tx, {
      operatorId: input.by,
      action: input.agreement === "terms" ? "customer.terms" : "customer.dpa",
      subjectType: "customer",
      subjectId: input.customerId,
      after: { version: input.version, acceptedAt: now.toISOString() },
    });
  });
}

/** Writes a new contact of a customer in the caller's transaction, and logs it. */
export async function insertContact(
  tx: BusinessTx,
  input: Omit<ContactInput, "id"> & { by: string },
): Promise<string> {
  const { customerId, by, ...fields } = input;
  const [created] = await tx
    .insert(contacts)
    .values({ ...fields, customerId })
    .returning({ id: contacts.id });
  if (!created) throw new Error("contact was not created");
  await recordEvent(tx, {
    operatorId: by,
    action: "contact.create",
    subjectType: "customer",
    subjectId: customerId,
    after: { contactId: created.id, ...fields },
  });
  return created.id;
}

export async function saveContact(
  db: BusinessDb,
  input: ContactInput & { by: string },
): Promise<string> {
  const { id, customerId, by, ...fields } = input;
  return db.transaction(async (tx) => {
    if (!id) return insertContact(tx, { ...fields, customerId, by });
    await tx
      .update(contacts)
      .set(fields)
      .where(and(eq(contacts.id, id), eq(contacts.customerId, customerId)));
    await recordEvent(tx, {
      operatorId: by,
      action: "contact.update",
      subjectType: "customer",
      subjectId: customerId,
      after: { contactId: id, ...fields },
    });
    return id;
  });
}

export async function removeContact(
  db: BusinessDb,
  input: { customerId: string; id: string; by: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({ status: "removed" })
      .where(
        and(
          eq(contacts.id, input.id),
          eq(contacts.customerId, input.customerId),
        ),
      );
    await recordEvent(tx, {
      operatorId: input.by,
      action: "contact.remove",
      subjectType: "customer",
      subjectId: input.customerId,
      after: { contactId: input.id },
    });
  });
}
