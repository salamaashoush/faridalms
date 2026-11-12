import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";
import { insertSitting } from "./standards";

type Tx = CellTransaction;

/**
 * The sitting a student's lesson is, made the first time it gives
 * evidence or a judgement. A second writer that lost the race to make it
 * takes the one that stands and puts its own away.
 */
export async function lessonSitting(
  tx: Tx,
  input: { tenantId: string; lessonId: string; studentId: string },
): Promise<string> {
  const found = async () => {
    const [row] = await tx.execute<{ sitting_id: string }>(sql`
      select sitting_id from core.lesson_sittings
      where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
        and student_user_id = ${input.studentId}::uuid and status = 'active'`);
    return row?.sitting_id ?? null;
  };
  const existing = await found();
  if (existing) return existing;
  const made = await insertSitting(tx, {
    tenantId: input.tenantId,
    studentId: input.studentId,
    kind: "lesson",
  });
  const [linked] = await tx.execute<{ sitting_id: string }>(sql`
    insert into core.lesson_sittings (tenant_id, sitting_id, student_user_id, lesson_id)
    values (${input.tenantId}::uuid, ${made}::uuid, ${input.studentId}::uuid,
      ${input.lessonId}::uuid)
    on conflict (tenant_id, lesson_id, student_user_id) where status = 'active' do nothing
    returning sitting_id`);
  if (linked) return linked.sitting_id;
  await tx.execute(sql`
    update core.standard_sittings set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${made}::uuid`);
  const standing = await found();
  if (!standing) throw new Error("lesson sitting not found");
  return standing;
}

/** The lesson each of these sittings is, for those that are a lesson still in use. */
export async function lessonsOfSittings(
  tx: Tx,
  input: { tenantId: string; sittingIds: readonly string[] },
): Promise<Map<string, { lessonId: string; moduleId: string; title: string }>> {
  if (input.sittingIds.length === 0) return new Map();
  const rows = await tx.execute<{
    sitting_id: string;
    lesson_id: string;
    module_id: string;
    title: string;
  }>(sql`
    select k.sitting_id, l.id as lesson_id, l.module_id, l.title
    from core.lesson_sittings k
    join core.lessons l on l.tenant_id = k.tenant_id and l.id = k.lesson_id
      and l.status = 'active'
    where k.tenant_id = ${input.tenantId}::uuid and k.status = 'active'
      and k.sitting_id = any(${uuidArray(input.sittingIds)})`);
  return new Map(
    rows.map((row) => [
      row.sitting_id,
      { lessonId: row.lesson_id, moduleId: row.module_id, title: row.title },
    ]),
  );
}

/** Of these sittings, those of lessons in a module set for the class. */
export async function lessonSittingsOfClass(
  tx: Tx,
  input: { tenantId: string; classId: string; sittingIds: readonly string[] },
): Promise<Set<string>> {
  if (input.sittingIds.length === 0) return new Set();
  const rows = await tx.execute<{ sitting_id: string }>(sql`
    select k.sitting_id from core.lesson_sittings k
    join core.lessons l on l.tenant_id = k.tenant_id and l.id = k.lesson_id
      and l.status = 'active'
    join core.module_classes mc on mc.tenant_id = l.tenant_id and mc.module_id = l.module_id
      and mc.class_id = ${input.classId}::uuid and mc.status = 'active'
    where k.tenant_id = ${input.tenantId}::uuid and k.status = 'active'
      and k.sitting_id = any(${uuidArray(input.sittingIds)})`);
  return new Set(rows.map((row) => row.sitting_id));
}
