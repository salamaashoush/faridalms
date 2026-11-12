import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

/*
 * Custody: the restrictions on a guardian's link and the court order behind
 * them. The restrictions table is invisible until the unit of work sets the
 * `custody` purpose, which only the families module's API does.
 */

export interface RestrictionRow {
  relationshipId: string;
  version: number;
  contactRestrictions: string | null;
  courtOrderFileId: string | null;
}

export async function restrictionsOf(
  tx: Tx,
  tenantId: string,
  relationshipIds: readonly string[],
): Promise<RestrictionRow[]> {
  if (relationshipIds.length === 0) return [];
  const rows = await tx.execute<{
    relationship_id: string;
    version: number;
    contact_restrictions: string | null;
    court_order_file_id: string | null;
  }>(sql`
    select relationship_id, version, contact_restrictions, court_order_file_id
    from core.relationship_restrictions
    where tenant_id = ${tenantId}::uuid and relationship_id = any(${uuidArray([...relationshipIds])})
      and status = 'active'`);
  return rows.map((row) => ({
    relationshipId: row.relationship_id,
    version: row.version,
    contactRestrictions: row.contact_restrictions,
    courtOrderFileId: row.court_order_file_id,
  }));
}

export async function saveRestriction(
  tx: Tx,
  input: {
    tenantId: string;
    relationshipId: string;
    contactRestrictions: string | null;
  },
) {
  await tx.execute(sql`
    insert into core.relationship_restrictions (tenant_id, relationship_id, contact_restrictions)
    values (${input.tenantId}::uuid, ${input.relationshipId}::uuid, ${input.contactRestrictions})
    on conflict (tenant_id, relationship_id)
    do update set contact_restrictions = excluded.contact_restrictions, status = 'active'`);
}

/**
 * Gives a guardian link its court order, or takes it away with null,
 * keeping whatever restriction the link has; returns the order it held.
 */
export async function setCourtOrder(
  tx: Tx,
  input: { tenantId: string; relationshipId: string; fileId: string | null },
): Promise<string | null> {
  const [before] = await tx.execute<{ court_order_file_id: string | null }>(sql`
    select court_order_file_id from core.relationship_restrictions
    where tenant_id = ${input.tenantId}::uuid and relationship_id = ${input.relationshipId}::uuid
      and status = 'active'
    for update`);
  await tx.execute(sql`
    insert into core.relationship_restrictions (tenant_id, relationship_id, court_order_file_id)
    values (${input.tenantId}::uuid, ${input.relationshipId}::uuid, ${input.fileId}::uuid)
    on conflict (tenant_id, relationship_id)
    do update set court_order_file_id = excluded.court_order_file_id, status = 'active'`);
  return before?.court_order_file_id ?? null;
}

/** The link a custody paper belongs to, and the student the link is for. */
export async function courtOrderLink(
  tx: Tx,
  tenantId: string,
  relationshipId: string,
): Promise<{ studentId: string; fileId: string | null } | null> {
  const [row] = await tx.execute<{
    student_user_id: string;
    court_order_file_id: string | null;
  }>(sql`
    select l.student_user_id, r.court_order_file_id
    from core.user_relationships l
    left join core.relationship_restrictions r on r.tenant_id = l.tenant_id
      and r.relationship_id = l.id and r.status = 'active'
    where l.tenant_id = ${tenantId}::uuid and l.id = ${relationshipId}::uuid`);
  return row
    ? { studentId: row.student_user_id, fileId: row.court_order_file_id }
    : null;
}

/** The derived custody flags every staff member sees; false when the link changed. */
export async function updateCustodyFlags(
  tx: Tx,
  input: {
    tenantId: string;
    studentId: string;
    relationshipId: string;
    expectedVersion: number;
    educationalRights: "full" | "restricted" | "none";
    communicationIsolated: boolean;
    pickup: "allowed" | "not_allowed" | "ask_office" | null;
  },
) {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.user_relationships
    set educational_rights = ${input.educationalRights}, communication_isolated = ${input.communicationIsolated},
        pickup = ${input.pickup}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.relationshipId}::uuid
      and student_user_id = ${input.studentId}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning id`);
  return rows.length > 0;
}
