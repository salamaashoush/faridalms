import type { ExamChangeDetails } from "@faridalms/domain/exams";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface ExamBoardRow {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
}

export interface ExamSessionRow {
  id: string;
  officialSeries: string | null;
  boardId: string | null;
  titleEn: string | null;
  titleAr: string | null;
  sitsIn: string;
  keepUntil: string | null;
  declarationRequired: boolean;
  aiEvidenceRequired: boolean;
}

type SessionRecord = {
  id: string;
  official_series: string | null;
  board_id: string | null;
  title_en: string | null;
  title_ar: string | null;
  sits_in: string;
  keep_until: string | null;
  declaration_required: boolean;
  ai_evidence_required: boolean;
};

const sessionOf = (row: SessionRecord): ExamSessionRow => ({
  id: row.id,
  officialSeries: row.official_series,
  boardId: row.board_id,
  titleEn: row.title_en,
  titleAr: row.title_ar,
  sitsIn: row.sits_in,
  keepUntil: row.keep_until,
  declarationRequired: row.declaration_required,
  aiEvidenceRequired: row.ai_evidence_required,
});

const sessionColumns = sql`id, official_series, board_id, title_en, title_ar,
  sits_in::text as sits_in, keep_until::text as keep_until,
  declaration_required, ai_evidence_required`;

export async function examBoardsOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<ExamBoardRow[]> {
  const rows = await tx.execute<{
    id: string;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    select id, title_en, title_ar from core.exam_boards
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'
    order by lower(coalesce(title_en, title_ar)), id`);
  return rows.map((row) => ({
    id: row.id,
    titleEn: row.title_en,
    titleAr: row.title_ar,
  }));
}

export async function saveExamBoard(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id?: string;
    titleEn: string | null;
    titleAr: string | null;
  },
): Promise<{ id: string } | null> {
  const [row] = input.id
    ? await tx.execute<{ id: string }>(sql`
        update core.exam_boards set title_en = ${input.titleEn}, title_ar = ${input.titleAr}
        where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
          and id = ${input.id}::uuid and status = 'active'
        returning id`)
    : await tx.execute<{ id: string }>(sql`
        insert into core.exam_boards (tenant_id, org_id, title_en, title_ar)
        values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.titleEn}, ${input.titleAr})
        returning id`);
  return row ?? null;
}

export async function examSessionsOf(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    /** These retired sessions too, which coursework set for them names. */
    alsoIds?: readonly string[];
  },
): Promise<ExamSessionRow[]> {
  const rows = await tx.execute<SessionRecord>(sql`
    select ${sessionColumns} from core.exam_sessions
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and (status = 'active' or id = any(${uuidArray(input.alsoIds ?? [])}))
    order by sits_in desc, id`);
  return rows.map(sessionOf);
}

export async function examSessionById(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    lock?: boolean;
    /** Also a retired session, which coursework set for it still follows. */
    retired?: boolean;
  },
): Promise<ExamSessionRow | null> {
  const [row] = await tx.execute<SessionRecord>(sql`
    select ${sessionColumns} from core.exam_sessions
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and (${input.retired ?? false} or status = 'active')
    ${input.lock ? sql`for update` : sql``}`);
  return row ? sessionOf(row) : null;
}

export async function insertExamSession(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    officialSeries: string | null;
    boardId: string | null;
    titleEn: string | null;
    titleAr: string | null;
    sitsIn: string;
    keepUntil: string | null;
    declarationRequired: boolean;
    aiEvidenceRequired: boolean;
  },
): Promise<ExamSessionRow> {
  const [row] = await tx.execute<SessionRecord>(sql`
    insert into core.exam_sessions (tenant_id, org_id, official_series, board_id,
      title_en, title_ar, sits_in, keep_until, declaration_required, ai_evidence_required)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.officialSeries},
      ${input.boardId}::uuid, ${input.titleEn}, ${input.titleAr}, ${input.sitsIn}::date,
      ${input.keepUntil}::date, ${input.declarationRequired}, ${input.aiEvidenceRequired})
    returning ${sessionColumns}`);
  if (!row) throw new Error("exam session not written");
  return sessionOf(row);
}

export async function updateExamSession(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    titleEn: string | null;
    titleAr: string | null;
    sitsIn: string;
    keepUntil: string | null;
    declarationRequired: boolean;
    aiEvidenceRequired: boolean;
  },
): Promise<ExamSessionRow> {
  const [row] = await tx.execute<SessionRecord>(sql`
    update core.exam_sessions set title_en = ${input.titleEn}, title_ar = ${input.titleAr},
      sits_in = ${input.sitsIn}::date, keep_until = ${input.keepUntil}::date,
      declaration_required = ${input.declarationRequired},
      ai_evidence_required = ${input.aiEvidenceRequired}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'
    returning ${sessionColumns}`);
  if (!row) throw new Error("exam session not written");
  return sessionOf(row);
}

export async function retireExamSession(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    update core.exam_sessions set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}

export interface ExamChange {
  id: string;
  occurredAt: string;
  action: string;
  objectId: string | null;
  actorEn: string | null;
  actorAr: string | null;
  details: ExamChangeDetails;
}

/** What the school's exams officers changed, newest first. */
export async function examChanges(
  tx: Tx,
  input: { tenantId: string; orgId: string; limit: number; offset: number },
): Promise<{ rows: ExamChange[]; total: number }> {
  const rows = await tx.execute<{
    id: string;
    occurred_at: string;
    action: string;
    object_id: string | null;
    actor_en: string | null;
    actor_ar: string | null;
    details: ExamChangeDetails;
    total: number;
  }>(sql`
    select l.id, l.occurred_at::text as occurred_at, l.action, l.object_id::text as object_id,
           a.full_name_en as actor_en, a.full_name_ar as actor_ar,
           l.details,
           count(*) over ()::int as total
    from audit.log l
    left join core.users a on a.tenant_id = l.tenant_id and a.id = l.actor_user_id
    where l.tenant_id = ${input.tenantId}::uuid and l.org_id = ${input.orgId}::uuid
      and l.outcome = 'success' and l.action like 'exam\\_%'
    order by l.occurred_at desc, l.id desc
    limit ${input.limit} offset ${input.offset}`);
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      action: row.action,
      objectId: row.object_id,
      actorEn: row.actor_en,
      actorAr: row.actor_ar,
      details: row.details,
    })),
  };
}

export interface AssessedCoursework {
  id: string;
  assignmentId: string;
  sessionId: string;
  component: string | null;
}

/** The exam session an assignment is assessed coursework for, if any. */
export async function courseworkOf(
  tx: Tx,
  input: { tenantId: string; assignmentId: string },
): Promise<AssessedCoursework | null> {
  const [row] = await tx.execute<{
    id: string;
    assignment_id: string;
    session_id: string;
    component: string | null;
  }>(sql`
    select id, assignment_id, session_id, component from core.coursework_assessments
    where tenant_id = ${input.tenantId}::uuid and assignment_id = ${input.assignmentId}::uuid
      and status = 'active'`);
  return row
    ? {
        id: row.id,
        assignmentId: row.assignment_id,
        sessionId: row.session_id,
        component: row.component,
      }
    : null;
}

/** Sets an assignment as coursework for a session, or with none, takes it off. */
export async function setCoursework(
  tx: Tx,
  input: {
    tenantId: string;
    assignmentId: string;
    sessionId: string | null;
    component: string | null;
    userId: string;
  },
): Promise<void> {
  if (!input.sessionId) {
    await tx.execute(sql`
      update core.coursework_assessments set status = 'tobedeleted'
      where tenant_id = ${input.tenantId}::uuid and assignment_id = ${input.assignmentId}::uuid
        and status = 'active'`);
    return;
  }
  const changed = await tx.execute<{ id: string }>(sql`
    update core.coursework_assessments set session_id = ${input.sessionId}::uuid,
      component = ${input.component}
    where tenant_id = ${input.tenantId}::uuid and assignment_id = ${input.assignmentId}::uuid
      and status = 'active'
    returning id`);
  if (changed.length) return;
  await tx.execute(sql`
    insert into core.coursework_assessments (tenant_id, assignment_id, session_id, component, set_by_user_id)
    values (${input.tenantId}::uuid, ${input.assignmentId}::uuid, ${input.sessionId}::uuid,
      ${input.component}, ${input.userId}::uuid)`);
}

export interface DeclarationRow {
  id: string;
  attemptId: string;
  kind: "student" | "paper";
  statement: string;
  aiUsed: boolean | null;
  recordedByUserId: string;
  declaredAt: string;
}

export interface AuthenticationRow {
  attemptId: string;
  outcome: "confirmed" | "not_confirmed";
  note: string | null;
  teacherUserId: string;
  teacherNameEn: string | null;
  teacherNameAr: string | null;
  at: string;
}

export async function declarationsOf(
  tx: Tx,
  input: { tenantId: string; attemptIds: readonly string[] },
): Promise<DeclarationRow[]> {
  if (!input.attemptIds.length) return [];
  const rows = await tx.execute<{
    id: string;
    attempt_id: string;
    kind: "student" | "paper";
    statement: string;
    ai_used: boolean | null;
    recorded_by_user_id: string;
    declared_at: string;
  }>(sql`
    select id, attempt_id, kind, statement, ai_used, recorded_by_user_id,
      to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as declared_at
    from core.attempt_declarations
    where tenant_id = ${input.tenantId}::uuid and attempt_id = any(${uuidArray(input.attemptIds)})
      and status = 'active'`);
  return rows.map((row) => ({
    id: row.id,
    attemptId: row.attempt_id,
    kind: row.kind,
    statement: row.statement,
    aiUsed: row.ai_used,
    recordedByUserId: row.recorded_by_user_id,
    declaredAt: row.declared_at,
  }));
}

export async function insertDeclaration(
  tx: Tx,
  input: {
    tenantId: string;
    attemptId: string;
    studentId: string;
    kind: "student" | "paper";
    statement: string;
    aiUsed: boolean | null;
    userId: string;
  },
): Promise<{ id: string }> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.attempt_declarations (tenant_id, attempt_id, student_user_id, kind,
      statement, ai_used, recorded_by_user_id)
    values (${input.tenantId}::uuid, ${input.attemptId}::uuid, ${input.studentId}::uuid,
      ${input.kind}, ${input.statement}, ${input.aiUsed}, ${input.userId}::uuid)
    returning id`);
  if (!row) throw new Error("declaration not written");
  return row;
}

export async function authenticationsOf(
  tx: Tx,
  input: { tenantId: string; attemptIds: readonly string[] },
): Promise<AuthenticationRow[]> {
  if (!input.attemptIds.length) return [];
  const rows = await tx.execute<{
    attempt_id: string;
    outcome: "confirmed" | "not_confirmed";
    note: string | null;
    teacher_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    at: string;
  }>(sql`
    select x.attempt_id, x.outcome, x.note, x.teacher_user_id, u.full_name_en, u.full_name_ar,
      to_char(x.date_last_modified at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
    from core.attempt_authentications x
    join core.users u on u.tenant_id = x.tenant_id and u.id = x.teacher_user_id
    where x.tenant_id = ${input.tenantId}::uuid and x.attempt_id = any(${uuidArray(input.attemptIds)})
      and x.status = 'active'`);
  return rows.map((row) => ({
    attemptId: row.attempt_id,
    outcome: row.outcome,
    note: row.note,
    teacherUserId: row.teacher_user_id,
    teacherNameEn: row.full_name_en,
    teacherNameAr: row.full_name_ar,
    at: row.at,
  }));
}

/** Records the teacher's word, replacing one that could not confirm. */
export async function saveAuthentication(
  tx: Tx,
  input: {
    tenantId: string;
    attemptId: string;
    outcome: "confirmed" | "not_confirmed";
    note: string | null;
    userId: string;
  },
): Promise<void> {
  const changed = await tx.execute<{ id: string }>(sql`
    update core.attempt_authentications set outcome = ${input.outcome}, note = ${input.note},
      teacher_user_id = ${input.userId}::uuid
    where tenant_id = ${input.tenantId}::uuid and attempt_id = ${input.attemptId}::uuid
      and status = 'active' and outcome = 'not_confirmed'
    returning id`);
  if (changed.length) return;
  await tx.execute(sql`
    insert into core.attempt_authentications (tenant_id, attempt_id, outcome, note, teacher_user_id)
    values (${input.tenantId}::uuid, ${input.attemptId}::uuid, ${input.outcome}, ${input.note},
      ${input.userId}::uuid)`);
}

export interface CourseworkSummary {
  assignmentId: string;
  title: string;
  classId: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  classCode: string;
  sessionId: string;
  component: string | null;
  students: number;
  handedIn: number;
  declared: number;
  confirmed: number;
  notConfirmed: number;
}

/** Every piece of assessed coursework in a school, with how far its work has got. */
export async function courseworkSummaries(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<CourseworkSummary[]> {
  const rows = await tx.execute<{
    assignment_id: string;
    title: string;
    class_id: string;
    title_en: string | null;
    title_ar: string | null;
    code: string;
    session_id: string;
    component: string | null;
    students: number;
    handed_in: number;
    declared: number;
    confirmed: number;
    not_confirmed: number;
  }>(sql`
    with latest as (
      select r.assignment_id, t.id as attempt_id
      from core.assignment_recipients r
      join core.coursework_assessments k on k.tenant_id = r.tenant_id
        and k.assignment_id = r.assignment_id and k.status = 'active'
      left join core.submissions s on s.tenant_id = r.tenant_id and s.assignment_id = r.assignment_id
        and s.student_user_id = r.student_user_id and s.status = 'active'
      left join lateral (
        select id from core.submission_attempts t
        where t.tenant_id = r.tenant_id and t.submission_id = s.id and t.status = 'active'
        order by t.number desc limit 1) t on true
      where r.tenant_id = ${input.tenantId}::uuid and r.status = 'active')
    select a.id as assignment_id, a.title, c.id as class_id, c.title_en, c.title_ar, c.code,
      k.session_id, k.component,
      count(l.*)::int as students,
      count(l.attempt_id)::int as handed_in,
      count(d.id)::int as declared,
      count(x.id) filter (where x.outcome = 'confirmed')::int as confirmed,
      count(x.id) filter (where x.outcome = 'not_confirmed')::int as not_confirmed
    from core.coursework_assessments k
    join core.assignments a on a.tenant_id = k.tenant_id and a.id = k.assignment_id
    join core.classes c on c.tenant_id = a.tenant_id and c.id = a.class_id
    left join latest l on l.assignment_id = a.id
    left join core.attempt_declarations d on d.tenant_id = k.tenant_id
      and d.attempt_id = l.attempt_id and d.status = 'active'
    left join core.attempt_authentications x on x.tenant_id = k.tenant_id
      and x.attempt_id = l.attempt_id and x.status = 'active'
    where k.tenant_id = ${input.tenantId}::uuid and k.status = 'active'
      and a.org_id = ${input.orgId}::uuid and a.status = 'active'
    group by a.id, a.title, c.id, c.title_en, c.title_ar, c.code, k.session_id, k.component
    order by a.title, a.id`);
  return rows.map((row) => ({
    assignmentId: row.assignment_id,
    title: row.title,
    classId: row.class_id,
    classTitleEn: row.title_en,
    classTitleAr: row.title_ar,
    classCode: row.code,
    sessionId: row.session_id,
    component: row.component,
    students: row.students,
    handedIn: row.handed_in,
    declared: row.declared,
    confirmed: row.confirmed,
    notConfirmed: row.not_confirmed,
  }));
}

/** The attempt a declaration covers, for reading the scan kept with it. */
export async function declarationAttempt(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<string | null> {
  const [row] = await tx.execute<{ attempt_id: string }>(sql`
    select attempt_id from core.attempt_declarations
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
  return row?.attempt_id ?? null;
}
