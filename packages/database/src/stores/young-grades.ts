import { YOUNG_STUDENT_GRADES } from "@faridalms/domain/descriptors/catalogue";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

/** Which of the classes teach a young grade. */
export async function classesOfYoungGrades(
  tx: Tx,
  tenantId: string,
  classIds: readonly string[],
): Promise<Set<string>> {
  if (classIds.length === 0) return new Set<string>();
  const rows = await tx.execute<{ class_id: string }>(sql`
    select g.class_id from core.class_grades g
    join core.descriptors d on d.tenant_id = g.tenant_id and d.id = g.grade_level_descriptor_id
    where g.tenant_id = ${tenantId}::uuid and g.class_id = any(${uuidArray(classIds)})
      and g.status = 'active' and d.system_meaning = any(${textArray(YOUNG_STUDENT_GRADES)})`);
  return new Set<string>(rows.map((row) => row.class_id));
}

/** Which of the students are in a young grade at the school on the day. */
export async function learnersOfYoungGrades(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    userIds: readonly string[];
    on: string;
  },
): Promise<Set<string>> {
  if (input.userIds.length === 0) return new Set<string>();
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct s.student_user_id as user_id
    from core.student_grades s
    join core.descriptors d on d.tenant_id = s.tenant_id and d.id = s.grade_level_descriptor_id
    where s.tenant_id = ${input.tenantId}::uuid and s.org_id = ${input.orgId}::uuid
      and s.student_user_id = any(${uuidArray(input.userIds)})
      and s.status = 'active' and s.valid_during @> ${input.on}::date
      and d.system_meaning = any(${textArray(YOUNG_STUDENT_GRADES)})`);
  return new Set<string>(rows.map((row) => row.user_id));
}
