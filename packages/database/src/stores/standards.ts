import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface FrameworkRow {
  id: string;
  version: number;
  title: string;
  description: string;
  caseIdentifier: string | null;
  standards: number;
}

type FrameworkRecord = {
  id: string;
  version: number;
  title: string;
  description: string;
  case_identifier: string | null;
  standards: number;
};

const frameworkOf = (row: FrameworkRecord): FrameworkRow => ({
  id: row.id,
  version: row.version,
  title: row.title,
  description: row.description,
  caseIdentifier: row.case_identifier,
  standards: row.standards,
});

const frameworkColumns = sql`f.id, f.version, f.title, f.description, f.case_identifier,
  (select count(*)::int from core.standards s
    where s.tenant_id = f.tenant_id and s.framework_id = f.id and s.status = 'active') as standards`;

/** A school's frameworks, by title, with how many standards each holds. */
export async function frameworksOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<FrameworkRow[]> {
  const rows = await tx.execute<FrameworkRecord>(sql`
    select ${frameworkColumns}
    from core.standard_frameworks f
    where f.tenant_id = ${input.tenantId}::uuid and f.org_id = ${input.orgId}::uuid
      and f.status = 'active'
    order by f.title, f.id`);
  return rows.map(frameworkOf);
}

export async function frameworkById(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<FrameworkRow | null> {
  const [row] = await tx.execute<FrameworkRecord>(sql`
    select ${frameworkColumns}
    from core.standard_frameworks f
    where f.tenant_id = ${input.tenantId}::uuid and f.org_id = ${input.orgId}::uuid
      and f.id = ${input.id}::uuid and f.status = 'active'`);
  return row ? frameworkOf(row) : null;
}

/** The framework a CASE package made before, to import it over again. */
export async function frameworkOfCase(
  tx: Tx,
  input: { tenantId: string; orgId: string; caseIdentifier: string },
): Promise<string | null> {
  const [row] = await tx.execute<{ id: string }>(sql`
    select id from core.standard_frameworks
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and case_identifier = ${input.caseIdentifier}::uuid and status = 'active'`);
  return row?.id ?? null;
}

export async function insertFramework(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    title: string;
    description: string;
    caseIdentifier: string | null;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.standard_frameworks (tenant_id, org_id, title, description, case_identifier)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.title}, ${input.description},
      ${input.caseIdentifier}::uuid)
    returning id, version`);
  if (!row) throw new Error("framework was not created");
  return row;
}

/** Null when another change came first. */
export async function updateFramework(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    title: string;
    description: string;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.standard_frameworks
    set title = ${input.title}, description = ${input.description}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/** Takes a framework and every standard in it out of use. */
export async function removeFramework(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    update core.standards set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and framework_id = ${input.id}::uuid
      and status = 'active'`);
  await tx.execute(sql`
    update core.standard_frameworks set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}

export interface StandardRow {
  id: string;
  version: number;
  frameworkId: string;
  parentId: string | null;
  code: string;
  statement: string;
  itemType: string;
  position: number;
}

type StandardRecord = {
  id: string;
  version: number;
  framework_id: string;
  parent_id: string | null;
  code: string;
  statement: string;
  item_type: string;
  position: number;
};

const standardOf = (row: StandardRecord): StandardRow => ({
  id: row.id,
  version: row.version,
  frameworkId: row.framework_id,
  parentId: row.parent_id,
  code: row.code,
  statement: row.statement,
  itemType: row.item_type,
  position: row.position,
});

const standardColumns = sql`id, version, framework_id, parent_id, code, statement, item_type, position`;

/** Every standard of a framework, siblings in order. */
export async function standardsOf(
  tx: Tx,
  input: { tenantId: string; frameworkId: string },
): Promise<StandardRow[]> {
  const rows = await tx.execute<StandardRecord>(sql`
    select ${standardColumns}
    from core.standards
    where tenant_id = ${input.tenantId}::uuid and framework_id = ${input.frameworkId}::uuid
      and status = 'active'
    order by parent_id nulls first, position, id`);
  return rows.map(standardOf);
}

export async function standardById(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<StandardRow | null> {
  const [row] = await tx.execute<StandardRecord>(sql`
    select ${standardColumns}
    from core.standards
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
  return row ? standardOf(row) : null;
}

/** Adds a standard as the last of its siblings. */
export async function insertStandard(
  tx: Tx,
  input: {
    tenantId: string;
    frameworkId: string;
    parentId: string | null;
    code: string;
    statement: string;
    itemType: string;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.standards (tenant_id, framework_id, parent_id, code, statement, item_type, position)
    values (${input.tenantId}::uuid, ${input.frameworkId}::uuid, ${input.parentId}::uuid,
      ${input.code}, ${input.statement}, ${input.itemType},
      (select coalesce(max(position) + 1, 0) from core.standards
        where tenant_id = ${input.tenantId}::uuid and framework_id = ${input.frameworkId}::uuid
          and parent_id is not distinct from ${input.parentId}::uuid and status = 'active'))
    returning id, version`);
  if (!row) throw new Error("standard was not created");
  return row;
}

/** Null when another change came first. */
export async function updateStandard(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    code: string;
    statement: string;
    itemType: string;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.standards
    set code = ${input.code}, statement = ${input.statement}, item_type = ${input.itemType}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/**
 * Puts a standard under another parent, or the same, at a place among its
 * siblings, numbering them afresh. The caller checks the new parent is in
 * the same framework and not under the standard itself.
 */
export async function moveStandard(
  tx: Tx,
  input: {
    tenantId: string;
    frameworkId: string;
    id: string;
    parentId: string | null;
    position: number;
  },
): Promise<void> {
  const siblings = await tx.execute<{ id: string }>(sql`
    select id from core.standards
    where tenant_id = ${input.tenantId}::uuid and framework_id = ${input.frameworkId}::uuid
      and parent_id is not distinct from ${input.parentId}::uuid and status = 'active'
      and id <> ${input.id}::uuid
    order by position, id`);
  const order = siblings.map((row) => row.id);
  order.splice(Math.min(input.position, order.length), 0, input.id);
  await tx.execute(sql`
    update core.standards s
    set parent_id = case when s.id = ${input.id}::uuid then ${input.parentId}::uuid
        else s.parent_id end,
      position = (v.position - 1)::int
    from unnest(${uuidArray(order)}) with ordinality as v(id, position)
    where s.tenant_id = ${input.tenantId}::uuid and s.id = v.id and s.status = 'active'`);
}

/** Whether `ancestor` is the standard itself or above it. */
export async function isWithin(
  tx: Tx,
  input: { tenantId: string; id: string; ancestor: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ within: boolean }>(sql`
    with recursive up(id, parent_id) as (
      select id, parent_id from core.standards
      where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      union all
      select s.id, s.parent_id from core.standards s
      join up on s.tenant_id = ${input.tenantId}::uuid and s.id = up.parent_id
    )
    select exists (select 1 from up where id = ${input.ancestor}::uuid) as within`);
  return row?.within ?? false;
}

/** Takes a standard and everything under it out of use. */
export async function removeStandard(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    with recursive down(id) as (
      select id from core.standards
      where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'
      union all
      select s.id from core.standards s
      join down on s.tenant_id = ${input.tenantId}::uuid and s.parent_id = down.id
      where s.status = 'active'
    )
    update core.standards set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id in (select id from down)`);
}

export interface StandardSummaryRow {
  id: string;
  code: string;
  statement: string;
  frameworkId: string;
  frameworkTitle: string;
}

type SummaryRecord = {
  id: string;
  code: string;
  statement: string;
  framework_id: string;
  framework_title: string;
};

const summaryOf = (row: SummaryRecord): StandardSummaryRow => ({
  id: row.id,
  code: row.code,
  statement: row.statement,
  frameworkId: row.framework_id,
  frameworkTitle: row.framework_title,
});

const escapeLike = (text: string) => text.replace(/[\\%_]/gu, "\\$&");

/**
 * A school's standards whose code or statement holds the words, codes that
 * begin with them first, for a teacher choosing what a question shows.
 */
export async function searchStandards(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    query: string;
    frameworkId: string;
    limit: number;
  },
): Promise<StandardSummaryRow[]> {
  const words = input.query.trim();
  const like = `%${escapeLike(words)}%`;
  const start = `${escapeLike(words)}%`;
  const rows = await tx.execute<SummaryRecord>(sql`
    select s.id, s.code, s.statement, f.id as framework_id, f.title as framework_title
    from core.standards s
    join core.standard_frameworks f on f.tenant_id = s.tenant_id and f.id = s.framework_id
    where s.tenant_id = ${input.tenantId}::uuid and f.org_id = ${input.orgId}::uuid
      and s.status = 'active' and f.status = 'active'
      ${input.frameworkId ? sql`and f.id = ${input.frameworkId}::uuid` : sql``}
      ${words ? sql`and (s.code ilike ${like} or s.statement ilike ${like})` : sql``}
    order by (s.code ilike ${start}) desc, f.title, s.code, s.position
    limit ${input.limit}`);
  return rows.map(summaryOf);
}

/** Standards by id as tags show them; ones taken out of use are left out. */
export async function standardsByIds(
  tx: Tx,
  input: { tenantId: string; orgId: string; ids: readonly string[] },
): Promise<StandardSummaryRow[]> {
  if (input.ids.length === 0) return [];
  const rows = await tx.execute<SummaryRecord>(sql`
    select s.id, s.code, s.statement, f.id as framework_id, f.title as framework_title
    from core.standards s
    join core.standard_frameworks f on f.tenant_id = s.tenant_id and f.id = s.framework_id
    where s.tenant_id = ${input.tenantId}::uuid and f.org_id = ${input.orgId}::uuid
      and s.id = any(${uuidArray(input.ids)}) and s.status = 'active' and f.status = 'active'`);
  return rows.map(summaryOf);
}

/**
 * Writes a CASE package's items into a framework: each item kept by its
 * CASE identifier, so one imported before is updated where it is, and
 * items the package no longer has taken out of use. Items given parents
 * before their children.
 */
export async function importStandards(
  tx: Tx,
  input: {
    tenantId: string;
    frameworkId: string;
    items: readonly {
      identifier: string;
      parentIdentifier: string | null;
      position: number;
      code: string;
      statement: string;
      itemType: string;
    }[];
  },
): Promise<number> {
  const ids = new Map<string, string>();
  const CHUNK = 500;
  for (let start = 0; start < input.items.length; start += CHUNK) {
    const chunk = input.items.slice(start, start + CHUNK);
    const rows = await tx.execute<{ id: string; case_identifier: string }>(sql`
      insert into core.standards (tenant_id, framework_id, parent_id, code, statement, item_type,
        position, case_identifier)
      values ${sql.join(
        chunk.map(
          (
            item,
          ) => sql`(${input.tenantId}::uuid, ${input.frameworkId}::uuid, null,
            ${item.code}, ${item.statement}, ${item.itemType}, ${item.position},
            ${item.identifier}::uuid)`,
        ),
        sql`, `,
      )}
      on conflict (tenant_id, framework_id, case_identifier)
        where status = 'active' and case_identifier is not null
      do update set parent_id = null, code = excluded.code, statement = excluded.statement,
        item_type = excluded.item_type, position = excluded.position
      returning id, case_identifier`);
    for (const row of rows) ids.set(row.case_identifier, row.id);
  }
  const parented = input.items.flatMap((item) => {
    const id = ids.get(item.identifier);
    const parent = item.parentIdentifier
      ? ids.get(item.parentIdentifier)
      : undefined;
    return id && parent ? [{ id, parent }] : [];
  });
  for (let start = 0; start < parented.length; start += CHUNK) {
    const chunk = parented.slice(start, start + CHUNK);
    await tx.execute(sql`
      update core.standards s set parent_id = v.parent
      from unnest(${uuidArray(chunk.map((row) => row.id))},
        ${uuidArray(chunk.map((row) => row.parent))}) as v(id, parent)
      where s.tenant_id = ${input.tenantId}::uuid and s.id = v.id`);
  }
  await tx.execute(sql`
    update core.standards set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and framework_id = ${input.frameworkId}::uuid
      and status = 'active' and case_identifier is not null
      and not (id = any(${uuidArray([...ids.values()])}))`);
  return ids.size;
}

/** What one marked answer shows, for each standard its question carried. */
export interface EvidenceMark {
  attempt: number;
  blockId: string;
  standards: readonly string[];
  fraction: number;
}

/**
 * Keeps the evidence a sitting's marked answers give, for the standards the
 * school still has. Marking again replaces it, keeping when the student
 * answered; otherwise the first answer stands, as a lesson's later tries
 * come after its feedback and hints.
 */
export async function recordEvidence(
  tx: Tx,
  input: {
    tenantId: string;
    studentId: string;
    sitting:
      | { source: "lesson"; lessonId: string }
      | { source: "quiz"; submissionId: string };
    marks: readonly EvidenceMark[];
    replace: boolean;
  },
): Promise<void> {
  const rows = input.marks.flatMap((mark) =>
    mark.standards.map(
      (standard) =>
        sql`(${mark.attempt}::smallint, ${mark.blockId}::uuid, ${standard}::uuid, ${mark.fraction}::numeric)`,
    ),
  );
  if (rows.length === 0) return;
  const lesson =
    input.sitting.source === "lesson" ? input.sitting.lessonId : null;
  const submission =
    input.sitting.source === "quiz" ? input.sitting.submissionId : null;
  await tx.execute(sql`
    insert into core.standard_evidence (tenant_id, student_user_id, standard_id, source, lesson_id,
      submission_id, attempt, block_id, fraction, answered_at)
    select ${input.tenantId}::uuid, ${input.studentId}::uuid, s.id, ${input.sitting.source},
      ${lesson}::uuid, ${submission}::uuid, e.attempt, e.block_id, e.fraction,
      statement_timestamp()
    from (values ${sql.join(rows, sql`, `)}) as e(attempt, block_id, standard_id, fraction)
    join core.standards s on s.tenant_id = ${input.tenantId}::uuid and s.id = e.standard_id
      and s.status = 'active'
    on conflict (tenant_id, sitting, student_user_id, attempt, block_id, standard_id)
      where status = 'active'
    ${
      input.replace
        ? sql`do update set fraction = excluded.fraction
            where core.standard_evidence.fraction is distinct from excluded.fraction`
        : sql`do nothing`
    }`);
}

/** A piece of evidence as mastery is worked out from it. */
export interface EvidenceRow {
  studentId: string;
  standardId: string;
  /** The sitting and attempt it came from, which group its answers. */
  occasion: string;
  fraction: number;
  answeredAt: string;
}

type EvidenceRecord = {
  student_user_id: string;
  standard_id: string;
  occasion: string;
  fraction: string | number;
  answered_at: string;
};

const evidenceOf = (row: EvidenceRecord): EvidenceRow => ({
  studentId: row.student_user_id,
  standardId: row.standard_id,
  occasion: row.occasion,
  fraction: Number(row.fraction),
  answeredAt: row.answered_at,
});

/**
 * The students' evidence on the school's standards. With a class, only what
 * the class's own work gave: its modules' lessons and its assignments.
 */
export async function evidenceOfStudents(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    studentIds: readonly string[];
    classId: string | null;
  },
): Promise<EvidenceRow[]> {
  if (input.studentIds.length === 0) return [];
  const rows = await tx.execute<EvidenceRecord>(sql`
    select e.student_user_id, e.standard_id, e.sitting::text || ':' || e.attempt as occasion,
      e.fraction, ${isoOf(sql`e.answered_at`)} as answered_at
    from core.standard_evidence e
    join core.standards s on s.tenant_id = e.tenant_id and s.id = e.standard_id and s.status = 'active'
    join core.standard_frameworks f on f.tenant_id = s.tenant_id and f.id = s.framework_id
      and f.status = 'active' and f.org_id = ${input.orgId}::uuid
    where e.tenant_id = ${input.tenantId}::uuid and e.status = 'active'
      and e.student_user_id = any(${uuidArray(input.studentIds)})
      ${
        input.classId
          ? sql`and (
            exists (select 1 from core.lessons l
              join core.module_classes mc on mc.tenant_id = l.tenant_id and mc.module_id = l.module_id
                and mc.class_id = ${input.classId}::uuid and mc.status = 'active'
              where l.tenant_id = e.tenant_id and l.id = e.lesson_id)
            or exists (select 1 from core.submissions sb
              join core.assignments a on a.tenant_id = sb.tenant_id and a.id = sb.assignment_id
                and a.class_id = ${input.classId}::uuid
              where sb.tenant_id = e.tenant_id and sb.id = e.submission_id))`
          : sql``
      }
    order by e.answered_at`);
  return rows.map(evidenceOf);
}
