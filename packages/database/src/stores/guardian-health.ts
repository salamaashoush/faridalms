import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { SummaryReader } from "./records";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

/** A guardian whose link permits the learner's medical summary on the day. */
export const guardianSummary =
  (input: {
    tenantId: string;
    viewerId: string;
    today: string;
  }): SummaryReader =>
  (studentId) =>
    sql`exists (
    select 1 from core.user_relationships r
    where r.tenant_id = ${input.tenantId}::uuid and r.related_user_id = ${input.viewerId}::uuid
      and r.student_user_id = ${studentId}
      and app.guardian_permits(r, ${input.today}::date, 'health'))`;

/** Names the emergency contact's link a requested change to a phone is about. */
export async function keepContactChange(
  tx: Tx,
  input: { tenantId: string; changeId: string; relationshipId: string },
) {
  await tx.execute(sql`
    insert into health.contact_changes (tenant_id, change_id, relationship_id)
    values (${input.tenantId}::uuid, ${input.changeId}::uuid, ${input.relationshipId}::uuid)`);
}

/** The link each requested change to an emergency contact is about, by the change. */
export async function contactChangesOf(
  tx: Tx,
  input: { tenantId: string; changeIds: readonly string[] },
): Promise<Map<string, string>> {
  if (input.changeIds.length === 0) return new Map();
  const rows = await tx.execute<{
    change_id: string;
    relationship_id: string;
  }>(sql`
    select change_id, relationship_id from health.contact_changes
    where tenant_id = ${input.tenantId}::uuid and change_id = any(${uuidArray(input.changeIds)})`);
  return new Map(rows.map((row) => [row.change_id, row.relationship_id]));
}
