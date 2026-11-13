import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

/** Which of the classes the school marked as for young children. */
export async function markedYoung(
  tx: Tx,
  tenantId: string,
  classIds: readonly string[],
): Promise<Set<string>> {
  if (classIds.length === 0) return new Set<string>();
  const rows = await tx.execute<{ class_id: string }>(sql`
    select class_id from core.young_classes
    where tenant_id = ${tenantId}::uuid and class_id = any(${uuidArray(classIds)})
      and status = 'active'`);
  return new Set<string>(rows.map((row) => row.class_id));
}

/** Marks the classes as for young children or not, answering those whose mark changed. */
export async function markYoung(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    classIds: readonly string[];
    young: boolean;
  },
): Promise<string[]> {
  if (input.classIds.length === 0) return [];
  const rows = input.young
    ? await tx.execute<{ class_id: string }>(sql`
        insert into core.young_classes (tenant_id, org_id, class_id)
        select c.tenant_id, c.org_id, c.id from core.classes c
        where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.orgId}::uuid
          and c.id = any(${uuidArray(input.classIds)})
          and not exists (select 1 from core.young_classes y where y.tenant_id = c.tenant_id
            and y.class_id = c.id and y.status = 'active')
        returning class_id`)
    : await tx.execute<{ class_id: string }>(sql`
        update core.young_classes set status = 'tobedeleted'
        where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
          and class_id = any(${uuidArray(input.classIds)}) and status = 'active'
        returning class_id`);
  return rows.map((row) => row.class_id);
}

/**
 * Which of the students learn on the day in a class marked for young
 * children: one such class makes a child young, whatever else they take.
 */
export async function learnersOfYoungClasses(
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
    select distinct e.user_id from core.enrollments e
    join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
    join core.young_classes y on y.tenant_id = c.tenant_id and y.class_id = c.id
      and y.status = 'active'
    where e.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.orgId}::uuid
      and e.user_id = any(${uuidArray(input.userIds)})
      and e.role = 'student' and e.status = 'active' and c.status = 'active'
      and e.valid_during @> ${input.on}::date and c.runs @> ${input.on}::date`);
  return new Set<string>(rows.map((row) => row.user_id));
}
