import type { FluencyMark } from "@faridalms/domain/learning";
import type { NormRow, ReadingLanguage } from "@faridalms/domain/reading";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { isoOf } from "./sql";

type Tx = CellTransaction;

export interface SavedNorms {
  language: ReadingLanguage;
  rows: NormRow[];
  version: number;
}

/** The norms a school wrote for itself, by language; a language it has not written is absent. */
export async function readingNormsOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<SavedNorms[]> {
  const rows = await tx.execute<{
    language: ReadingLanguage;
    rows: NormRow[];
    version: number;
  }>(sql`
    select language, rows, version from core.reading_norms
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'`);
  return rows.map((row) => ({
    language: row.language,
    rows: row.rows,
    version: row.version,
  }));
}

/**
 * Keeps a school's norms for a language, in place of what it had. Null when
 * they changed since the version the caller read; zero expects none yet.
 */
export async function saveReadingNorms(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    language: ReadingLanguage;
    rows: readonly NormRow[];
    expectedVersion: number;
  },
): Promise<{ version: number } | null> {
  const rows = JSON.stringify(input.rows);
  if (input.expectedVersion === 0) {
    const [created] = await tx.execute<{ version: number }>(sql`
      insert into core.reading_norms (tenant_id, org_id, language, rows)
      values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.language},
        ${rows}::text::jsonb)
      on conflict (tenant_id, org_id, language) where status = 'active' do nothing
      returning version`);
    return created ?? null;
  }
  const [updated] = await tx.execute<{ version: number }>(sql`
    update core.reading_norms set rows = ${rows}::text::jsonb
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and language = ${input.language} and status = 'active'
      and version = ${input.expectedVersion}
    returning version`);
  return updated ?? null;
}

/** Sets a school's norms for a language aside, so it reads the defaults again. */
export async function resetReadingNorms(
  tx: Tx,
  input: { tenantId: string; orgId: string; language: ReadingLanguage },
): Promise<void> {
  await tx.execute(sql`
    update core.reading_norms set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and language = ${input.language} and status = 'active'`);
}

export interface QuizReading {
  assignmentId: string;
  title: string;
  blockId: string;
  fluency: FluencyMark;
  markedAt: string;
}

/** Each passage a student read aloud in a quiz and a teacher marked word by word in the period. */
export async function quizReadingsOf(
  tx: Tx,
  input: { tenantId: string; studentId: string; from: string; before: string },
): Promise<QuizReading[]> {
  const rows = await tx.execute<{
    assignment_id: string;
    title: string;
    block_id: string;
    fluency: FluencyMark;
    marked_at: string;
  }>(sql`
    select s.assignment_id, a.title, q.block_id, q.fluency,
      ${isoOf(sql`q.date_last_modified`)} as marked_at
    from core.quiz_answers q
    join core.submissions s on s.tenant_id = q.tenant_id and s.id = q.submission_id
    join core.assignments a on a.tenant_id = s.tenant_id and a.id = s.assignment_id
    where q.tenant_id = ${input.tenantId}::uuid and q.student_user_id = ${input.studentId}::uuid
      and q.status = 'active' and q.fluency is not null
      and q.date_last_modified >= ${input.from}::date and q.date_last_modified < ${input.before}::date
    order by q.date_last_modified`);
  return rows.map((row) => ({
    assignmentId: row.assignment_id,
    title: row.title,
    blockId: row.block_id,
    fluency: row.fluency,
    markedAt: row.marked_at,
  }));
}

/** The grade a student was in over each stretch of their enrolment, by its fixed meaning. */
export async function gradesOverTime(
  tx: Tx,
  input: { tenantId: string; studentId: string },
): Promise<{ from: string; before: string | null; grade: string | null }[]> {
  const rows = await tx.execute<{
    from: string;
    before: string | null;
    grade: string | null;
  }>(sql`
    select lower(y.valid_during)::text as from, upper(y.valid_during)::text as before,
      d.system_meaning as grade
    from core.student_school_years y
    left join core.descriptors d on d.tenant_id = y.tenant_id and d.id = y.grade_level_descriptor_id
    where y.tenant_id = ${input.tenantId}::uuid and y.student_user_id = ${input.studentId}::uuid
      and y.status = 'active'
    order by lower(y.valid_during)`);
  return rows;
}
