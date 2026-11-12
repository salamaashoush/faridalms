import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { AssignmentRecord, AssignmentRow } from "./coursework";

import { assignmentColumns, assignmentOf } from "./coursework";
import { uuidArray } from "./sql";

type Tx = CellTransaction;

/** Where a discussion sits: its module, and the module discussion it is one class's part of. */
export interface Placement {
  moduleId: string;
  group: string;
}

/**
 * Only a discussion sits in a module. One whose format changed while the
 * module's link was not acting is read as sitting nowhere.
 */
const placed = sql`join core.assignments a on a.tenant_id = d.tenant_id and a.id = d.assignment_id
  and a.status = 'active' and a.submission_format = 'discussion'`;

/** The module each of these discussions sits in, for those in one. */
export async function placementsOf(
  tx: Tx,
  input: { tenantId: string; assignmentIds: readonly string[] },
): Promise<Map<string, Placement>> {
  if (input.assignmentIds.length === 0) return new Map();
  const rows = await tx.execute<{
    assignment_id: string;
    module_id: string;
    discussion_group: string;
  }>(sql`
    select d.assignment_id, d.module_id, d.discussion_group
    from core.module_discussions d ${placed}
    where d.tenant_id = ${input.tenantId}::uuid and d.status = 'active'
      and d.assignment_id = any(${uuidArray(input.assignmentIds)})`);
  return new Map(
    rows.map((row) => [
      row.assignment_id,
      { moduleId: row.module_id, group: row.discussion_group },
    ]),
  );
}

/** Puts a discussion in a module, as one class's part of a module discussion. */
export async function placeDiscussion(
  tx: Tx,
  input: {
    tenantId: string;
    assignmentId: string;
    classId: string;
    moduleId: string;
    group: string;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.module_discussions (tenant_id, assignment_id, class_id, module_id,
      discussion_group)
    values (${input.tenantId}::uuid, ${input.assignmentId}::uuid, ${input.classId}::uuid,
      ${input.moduleId}::uuid, ${input.group}::uuid)`);
}

/** Every class's part of a module discussion, archived ones included, first made first. */
export async function discussionParts(
  tx: Tx,
  input: { tenantId: string; group: string },
): Promise<AssignmentRow[]> {
  const rows = await tx.execute<AssignmentRecord>(sql`
    select ${assignmentColumns} from core.module_discussions d ${placed}
    where d.tenant_id = ${input.tenantId}::uuid and d.discussion_group = ${input.group}::uuid
      and d.status = 'active'
    order by a.created_at, a.id`);
  return rows.map(assignmentOf);
}

/** The module discussions a module holds, by group. */
export async function discussionGroupsOf(
  tx: Tx,
  input: { tenantId: string; moduleId: string },
): Promise<string[]> {
  const rows = await tx.execute<{ discussion_group: string }>(sql`
    select distinct d.discussion_group from core.module_discussions d ${placed}
    where d.tenant_id = ${input.tenantId}::uuid and d.module_id = ${input.moduleId}::uuid
      and d.status = 'active' and a.state <> 'archived'`);
  return rows.map((row) => row.discussion_group);
}

/** The discussions a module holds, in any of its classes, in the order they fall due. */
export async function moduleDiscussions(
  tx: Tx,
  input: { tenantId: string; moduleId: string },
): Promise<AssignmentRow[]> {
  const rows = await tx.execute<AssignmentRecord>(sql`
    select ${assignmentColumns} from core.module_discussions d ${placed}
    where d.tenant_id = ${input.tenantId}::uuid and d.module_id = ${input.moduleId}::uuid
      and d.status = 'active' and a.state <> 'archived'
    order by a.due_at nulls last, a.created_at, a.id`);
  return rows.map(assignmentOf);
}
