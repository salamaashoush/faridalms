import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export type GradeAudienceKind = "broadcast" | "calendar_event";

const TABLES = {
  broadcast: {
    table: sql`core.broadcast_grades`,
    column: sql.identifier("broadcast_id"),
  },
  calendar_event: {
    table: sql`core.calendar_event_grades`,
    column: sql.identifier("event_id"),
  },
} as const;

/** The grades an announcement or event goes to. */
export async function gradeAudiencesOf(
  tx: Tx,
  input: { tenantId: string; kind: GradeAudienceKind; ownerId: string },
): Promise<string[]> {
  const { table, column } = TABLES[input.kind];
  const rows = await tx.execute<{ grade_id: string }>(sql`
    select grade_level_descriptor_id as grade_id from ${table}
    where tenant_id = ${input.tenantId}::uuid and ${column} = ${input.ownerId}::uuid
      and status = 'active'
    order by created_at, id`);
  return rows.map((row) => row.grade_id);
}

/** Replaces the grades an announcement or event goes to. */
export async function setGradeAudiences(
  tx: Tx,
  input: {
    tenantId: string;
    kind: GradeAudienceKind;
    ownerId: string;
    gradeIds: readonly string[];
  },
) {
  const { table, column } = TABLES[input.kind];
  await tx.execute(sql`
    update ${table} set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and ${column} = ${input.ownerId}::uuid
      and status = 'active'`);
  const wanted = [...new Set(input.gradeIds)];
  if (wanted.length === 0) return;
  await tx.execute(sql`
    insert into ${table} (tenant_id, ${column}, grade_level_descriptor_id)
    select ${input.tenantId}::uuid, ${input.ownerId}::uuid, grade
    from unnest(${uuidArray(wanted)}) as grade`);
}

/** The announcements or events whose grades the classes teach. */
export async function ownersOfClassGrades(
  tx: Tx,
  input: {
    tenantId: string;
    kind: GradeAudienceKind;
    classIds: readonly string[];
  },
): Promise<string[]> {
  if (input.classIds.length === 0) return [];
  const { table, column } = TABLES[input.kind];
  const rows = await tx.execute<{ owner_id: string }>(sql`
    select distinct x.${column} as owner_id from ${table} x
    join core.class_grades g on g.tenant_id = x.tenant_id
      and g.grade_level_descriptor_id = x.grade_level_descriptor_id and g.status = 'active'
    where x.tenant_id = ${input.tenantId}::uuid and x.status = 'active'
      and g.class_id = any(${uuidArray(input.classIds)})`);
  return rows.map((row) => row.owner_id);
}
