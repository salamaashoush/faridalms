import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { Among, Raw } from "./search";
import type { Scope } from "./students";

import { taughtClasses } from "./classes";
import { found, snippetOf, titled } from "./search";
import { isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface AssignmentAccess {
  tenantId: string;
  schoolId: string;
  teaching: Scope | null;
  learners: readonly string[];
}

const assignmentOpen = (input: AssignmentAccess) => sql`(
  a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.schoolId}::uuid and a.status = 'active'
  and (${input.teaching ? sql`a.class_id in ${taughtClasses(input.teaching)}` : sql`false`}
    or (a.state = 'published' and exists (select 1 from core.assignment_recipients r
      where r.tenant_id = a.tenant_id and r.assignment_id = a.id and r.status = 'active'
        and r.student_user_id = any(${uuidArray(input.learners)})))))`;

/** The assignments the viewer may open: in a class they teach, or published to one of `learners`. */
export const assignmentsReached = (input: AssignmentAccess) =>
  sql`(select a.id from core.assignments a where ${assignmentOpen(input)})`;

/**
 * Assignments among `ids` the viewer may open: in a class they teach, or
 * published to one of `learners` (the viewer, or the children they follow).
 */
export async function assignmentsAmong(
  tx: Tx,
  input: Among & AssignmentAccess,
) {
  return found(
    await tx.execute<Raw>(sql`
      select a.id, 'assignment' as type, a.title, ${snippetOf(sql`d.plain_text`, input.q)} as snippet,
        ${titled(input.ar, "c")} as context, ${isoOf(sql`a.due_at`)} as "when",
        case when a.state = 'draft' then 'draft' when a.state = 'scheduled' then 'scheduled' end as flag,
        null as roles
      from core.assignments a
      join core.classes c on c.tenant_id = a.tenant_id and c.id = a.class_id
      left join core.documents d on d.tenant_id = a.tenant_id and d.host_type = 'assignment'
        and d.host_id = a.id and d.status = 'active' and d.translation_of_id is null
      where a.id = any(${uuidArray(input.ids)}) and ${assignmentOpen(input)}`),
  );
}
