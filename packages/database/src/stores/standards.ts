import type { GoalLevel } from "@faridalms/domain/standards";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { EvidenceSource } from "../tables/learning";

import { escapeLike, holds, isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface FrameworkRow {
  id: string;
  version: number;
  title: string;
  description: string;
  caseIdentifier: string | null;
  assessed: boolean;
  standards: number;
}

type FrameworkRecord = {
  id: string;
  version: number;
  title: string;
  description: string;
  case_identifier: string | null;
  assessed: boolean;
  standards: number;
};

const frameworkOf = (row: FrameworkRecord): FrameworkRow => ({
  id: row.id,
  version: row.version,
  title: row.title,
  description: row.description,
  caseIdentifier: row.case_identifier,
  assessed: row.assessed,
  standards: row.standards,
});

const frameworkColumns = sql`f.id, f.version, f.title, f.description, f.case_identifier, f.assessed,
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
    assessed: boolean;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.standard_frameworks (tenant_id, org_id, title, description, case_identifier,
      assessed)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.title}, ${input.description},
      ${input.caseIdentifier}::uuid, ${input.assessed})
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
    assessed: boolean;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.standard_frameworks
    set title = ${input.title}, description = ${input.description}, assessed = ${input.assessed}
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
  /** Its framework's items are assessed, rather than framing units. */
  assessed: boolean;
}

type SummaryRecord = {
  id: string;
  code: string;
  statement: string;
  framework_id: string;
  framework_title: string;
  assessed: boolean;
};

const summaryOf = (row: SummaryRecord): StandardSummaryRow => ({
  id: row.id,
  code: row.code,
  statement: row.statement,
  frameworkId: row.framework_id,
  frameworkTitle: row.framework_title,
  assessed: row.assessed,
});

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
  const start = `${escapeLike(words)}%`;
  const rows = await tx.execute<SummaryRecord>(sql`
    select s.id, s.code, s.statement, f.id as framework_id, f.title as framework_title,
      f.assessed
    from core.standards s
    join core.standard_frameworks f on f.tenant_id = s.tenant_id and f.id = s.framework_id
    where s.tenant_id = ${input.tenantId}::uuid and f.org_id = ${input.orgId}::uuid
      and s.status = 'active' and f.status = 'active'
      ${input.frameworkId ? sql`and f.id = ${input.frameworkId}::uuid` : sql``}
      ${words ? sql`and (${holds(words, [sql`s.code`, sql`s.statement`])})` : sql``}
    order by (s.code ilike ${start}) desc, f.title, s.code collate core.natural, s.position
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
    select s.id, s.code, s.statement, f.id as framework_id, f.title as framework_title,
      f.assessed
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
      | { source: "quiz" | "rubric"; submissionId: string };
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
    input.sitting.source === "lesson" ? null : input.sitting.submissionId;
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

/**
 * Keeps what one graded attempt's rubric shows, in place of what it showed
 * before: a criterion left unmarked, or no longer carrying a standard, takes
 * its evidence back.
 */
export async function recordRubricEvidence(
  tx: Tx,
  input: {
    tenantId: string;
    studentId: string;
    submissionId: string;
    attempt: number;
    marks: readonly Omit<EvidenceMark, "attempt">[];
  },
): Promise<void> {
  const kept = input.marks.flatMap((mark) =>
    mark.standards.map(
      (standard) => sql`(${mark.blockId}::uuid, ${standard}::uuid)`,
    ),
  );
  await tx.execute(sql`
    update core.standard_evidence set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
      and student_user_id = ${input.studentId}::uuid and source = 'rubric'
      and attempt = ${input.attempt} and status = 'active'
      ${
        kept.length > 0
          ? sql`and (block_id, standard_id) not in (values ${sql.join(kept, sql`, `)})`
          : sql``
      }`);
  await recordEvidence(tx, {
    tenantId: input.tenantId,
    studentId: input.studentId,
    sitting: { source: "rubric", submissionId: input.submissionId },
    marks: input.marks.map((mark) => ({ ...mark, attempt: input.attempt })),
    replace: true,
  });
}

/**
 * Evidence from handed-in work as its student and family may read it, by
 * what the work itself shows them: a quiz's answers once its results show,
 * which for most quizzes is at once and for some only once returned; a
 * rubric once the grade is returned.
 */
const releasedOnly = sql`and (e.submission_id is null or (
  e.source = 'quiz' and exists (
    select 1 from core.submissions sb
    join core.assignments a on a.tenant_id = sb.tenant_id and a.id = sb.assignment_id
    where sb.tenant_id = e.tenant_id and sb.id = e.submission_id
      and a.quiz_reveal is distinct from 'returned'))
  or exists (
    select 1 from core.assessments asm
    join core.submission_attempts t on t.tenant_id = asm.tenant_id and t.id = asm.attempt_id
    where asm.tenant_id = e.tenant_id and asm.submission_id = e.submission_id
      and asm.status = 'active' and asm.released_at is not null and t.number = e.attempt))`;

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
    /** Only what the student already knows of: grades returned to them. */
    released: boolean;
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
      ${input.released ? releasedOnly : sql``}
    order by e.answered_at`);
  return rows.map(evidenceOf);
}

/** One sitting a student's mastery of a standard was worked out from. */
export interface SittingRow {
  source: EvidenceSource;
  /** The lesson, or the assignment the quiz belongs to. */
  workId: string;
  title: string;
  attempt: number;
  /** Its answers on the standard averaged, from 0 to 1. */
  fraction: number;
  answers: number;
  at: string;
}

/** The sittings behind a student's mastery of one of the school's standards, latest first. */
export async function sittingsOfStandard(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    studentId: string;
    standardId: string;
    released: boolean;
  },
): Promise<SittingRow[]> {
  const rows = await tx.execute<{
    source: EvidenceSource;
    work_id: string;
    title: string;
    attempt: number;
    fraction: string | number;
    answers: number;
    at: string;
  }>(sql`
    select e.source, coalesce(l.id, a.id) as work_id, coalesce(l.title, a.title) as title,
      e.attempt, avg(e.fraction) as fraction, count(*)::int as answers,
      ${isoOf(sql`max(e.answered_at)`)} as at
    from core.standard_evidence e
    join core.standards s on s.tenant_id = e.tenant_id and s.id = e.standard_id and s.status = 'active'
    join core.standard_frameworks f on f.tenant_id = s.tenant_id and f.id = s.framework_id
      and f.status = 'active' and f.org_id = ${input.orgId}::uuid
    left join core.lessons l on l.tenant_id = e.tenant_id and l.id = e.lesson_id
    left join core.submissions sb on sb.tenant_id = e.tenant_id and sb.id = e.submission_id
    left join core.assignments a on a.tenant_id = sb.tenant_id and a.id = sb.assignment_id
    where e.tenant_id = ${input.tenantId}::uuid and e.status = 'active'
      and e.student_user_id = ${input.studentId}::uuid and e.standard_id = ${input.standardId}::uuid
      and coalesce(l.id, a.id) is not null
      ${input.released ? releasedOnly : sql``}
    group by e.source, e.sitting, e.attempt, l.id, l.title, a.id, a.title
    order by max(e.answered_at) desc`);
  return rows.map((row) => ({
    source: row.source,
    workId: row.work_id,
    title: row.title,
    attempt: row.attempt,
    fraction: Number(row.fraction),
    answers: row.answers,
    at: row.at,
  }));
}

export type ObservedLevel = "beginning" | "developing" | "secure";

/** What a teacher saw a student do against a standard, as mastery and its sittings read it. */
export interface ObservationRow {
  id: string;
  studentId: string;
  standardId: string;
  level: ObservedLevel;
  note: string;
  observedByUserId: string;
  observedByEn: string | null;
  observedByAr: string | null;
  observedAt: string;
}

/** Keeps what a teacher saw a student do against a standard. */
export async function insertObservation(
  tx: Tx,
  input: {
    tenantId: string;
    studentId: string;
    standardId: string;
    classId: string | null;
    level: ObservedLevel;
    note: string;
    userId: string;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.standard_observations (tenant_id, student_user_id, standard_id, class_id,
      level, note, observed_by_user_id, observed_at)
    values (${input.tenantId}::uuid, ${input.studentId}::uuid, ${input.standardId}::uuid,
      ${input.classId}::uuid, ${input.level}, ${input.note}, ${input.userId}::uuid,
      statement_timestamp())
    returning id`);
  if (!row) throw new Error("observation not written");
  return row.id;
}

/** Takes an observation back; whether there was one to take. */
export async function removeObservation(
  tx: Tx,
  input: { tenantId: string; id: string; observedBy: string | null },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.standard_observations set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'
      ${input.observedBy ? sql`and observed_by_user_id = ${input.observedBy}::uuid` : sql``}
    returning id`);
  return rows.length > 0;
}

/**
 * The students' observations on the school's standards, oldest first; with a
 * class, only those seen in it.
 */
export async function observationsOf(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    studentIds: readonly string[];
    classId: string | null;
    standardId?: string;
  },
): Promise<ObservationRow[]> {
  if (input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    student_user_id: string;
    standard_id: string;
    level: ObservedLevel;
    note: string;
    observed_by_user_id: string;
    by_en: string | null;
    by_ar: string | null;
    observed_at: string;
  }>(sql`
    select o.id, o.student_user_id, o.standard_id, o.level, o.note, o.observed_by_user_id,
      u.full_name_en as by_en, u.full_name_ar as by_ar, ${isoOf(sql`o.observed_at`)} as observed_at
    from core.standard_observations o
    join core.standards s on s.tenant_id = o.tenant_id and s.id = o.standard_id and s.status = 'active'
    join core.standard_frameworks f on f.tenant_id = s.tenant_id and f.id = s.framework_id
      and f.status = 'active' and f.org_id = ${input.orgId}::uuid
    join core.users u on u.tenant_id = o.tenant_id and u.id = o.observed_by_user_id
    where o.tenant_id = ${input.tenantId}::uuid and o.status = 'active'
      and o.student_user_id = any(${uuidArray(input.studentIds)})
      ${input.classId ? sql`and o.class_id = ${input.classId}::uuid` : sql``}
      ${input.standardId ? sql`and o.standard_id = ${input.standardId}::uuid` : sql``}
    order by o.observed_at`);
  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_user_id,
    standardId: row.standard_id,
    level: row.level,
    note: row.note,
    observedByUserId: row.observed_by_user_id,
    observedByEn: row.by_en,
    observedByAr: row.by_ar,
    observedAt: row.observed_at,
  }));
}

/** A teacher's judgement of a child against a goal, and the work it came from. */
export interface JudgementRow {
  studentId: string;
  standardId: string;
  frameworkId: string;
  level: GoalLevel;
  note: string;
  lesson: { id: string; title: string; blockId: string } | null;
  judgedByUserId: string;
  judgedAt: string;
}

type JudgementRecord = {
  student_user_id: string;
  standard_id: string;
  framework_id: string;
  level: GoalLevel;
  note: string;
  lesson_id: string | null;
  lesson_title: string | null;
  block_id: string | null;
  judged_by_user_id: string;
  judged_at: string;
};

const judgementOf = (row: JudgementRecord): JudgementRow => ({
  studentId: row.student_user_id,
  standardId: row.standard_id,
  frameworkId: row.framework_id,
  level: row.level,
  note: row.note,
  lesson:
    row.lesson_id && row.lesson_title !== null && row.block_id
      ? { id: row.lesson_id, title: row.lesson_title, blockId: row.block_id }
      : null,
  judgedByUserId: row.judged_by_user_id,
  judgedAt: row.judged_at,
});

/**
 * The students' current judgements on the school's standards, or on only
 * the ones named.
 */
export async function judgementsOf(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    studentIds: readonly string[];
    standardIds?: readonly string[];
  },
): Promise<JudgementRow[]> {
  if (input.studentIds.length === 0 || input.standardIds?.length === 0)
    return [];
  const rows = await tx.execute<JudgementRecord>(sql`
    select j.student_user_id, j.standard_id, s.framework_id, j.level, j.note, j.lesson_id,
      l.title as lesson_title, j.block_id, j.judged_by_user_id,
      ${isoOf(sql`j.judged_at`)} as judged_at
    from core.goal_judgements j
    join core.standards s on s.tenant_id = j.tenant_id and s.id = j.standard_id and s.status = 'active'
    join core.standard_frameworks f on f.tenant_id = s.tenant_id and f.id = s.framework_id
      and f.status = 'active' and f.org_id = ${input.orgId}::uuid
    left join core.lessons l on l.tenant_id = j.tenant_id and l.id = j.lesson_id
      and l.status = 'active'
    where j.tenant_id = ${input.tenantId}::uuid and j.status = 'active'
      and j.student_user_id = any(${uuidArray(input.studentIds)})
      ${input.standardIds ? sql`and j.standard_id = any(${uuidArray(input.standardIds)})` : sql``}
    order by j.judged_at`);
  return rows.map(judgementOf);
}

/**
 * Records where a child stands against a goal, replacing what was judged
 * before. Without a note or the work it came from, a judgement keeps the
 * ones an earlier judgement had, as a change of mind about a child is still
 * about what was seen.
 */
export async function judgeGoal(
  tx: Tx,
  input: {
    tenantId: string;
    studentId: string;
    standardId: string;
    level: GoalLevel;
    note?: string;
    from?: { lessonId: string; blockId: string };
    judgedByUserId: string;
  },
): Promise<void> {
  const keep = input.from === undefined;
  const keepNote = input.note === undefined;
  await tx.execute(sql`
    insert into core.goal_judgements (tenant_id, student_user_id, standard_id, level, note,
      lesson_id, block_id, judged_by_user_id, judged_at)
    values (${input.tenantId}::uuid, ${input.studentId}::uuid, ${input.standardId}::uuid,
      ${input.level}, ${input.note ?? ""}, ${input.from?.lessonId ?? null}::uuid,
      ${input.from?.blockId ?? null}::uuid, ${input.judgedByUserId}::uuid, statement_timestamp())
    on conflict (tenant_id, student_user_id, standard_id) where status = 'active'
    do update set level = excluded.level,
      note = ${keepNote ? sql`core.goal_judgements.note` : sql`excluded.note`},
      lesson_id = ${keep ? sql`core.goal_judgements.lesson_id` : sql`excluded.lesson_id`},
      block_id = ${keep ? sql`core.goal_judgements.block_id` : sql`excluded.block_id`},
      judged_by_user_id = excluded.judged_by_user_id, judged_at = excluded.judged_at`);
}

/** Takes a child's judgement on a goal back, leaving the goal unjudged. */
export async function clearJudgement(
  tx: Tx,
  input: { tenantId: string; studentId: string; standardId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.goal_judgements set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and student_user_id = ${input.studentId}::uuid
      and standard_id = ${input.standardId}::uuid and status = 'active'`);
}
