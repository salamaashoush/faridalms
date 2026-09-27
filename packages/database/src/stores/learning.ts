import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { LessonCompletion, ModuleState } from "../tables/learning";

import { isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface ModuleRow {
  id: string;
  version: number;
  orgId: string;
  schoolYearId: string;
  title: string;
  summary: string;
  state: ModuleState;
  publishAt: string | null;
  sequential: boolean;
  prerequisiteId: string | null;
  prerequisiteTitle: string | null;
  authorUserId: string;
  authorNameEn: string | null;
  authorNameAr: string | null;
}

const moduleColumns = sql`m.id, m.version, m.org_id, m.school_year_id, m.title, m.summary, m.state,
  ${isoOf(sql`m.publish_at`)} as publish_at, m.sequential, m.prerequisite_module_id,
  p.title as prerequisite_title, m.author_user_id, u.full_name_en as author_en,
  u.full_name_ar as author_ar`;

const moduleFrom = sql`core.learning_modules m
  join core.users u on u.tenant_id = m.tenant_id and u.id = m.author_user_id
  left join core.learning_modules p on p.tenant_id = m.tenant_id and p.id = m.prerequisite_module_id
    and p.status = 'active'`;

type ModuleRecord = {
  id: string;
  version: number;
  org_id: string;
  school_year_id: string;
  title: string;
  summary: string;
  state: ModuleState;
  publish_at: string | null;
  sequential: boolean;
  prerequisite_module_id: string | null;
  prerequisite_title: string | null;
  author_user_id: string;
  author_en: string | null;
  author_ar: string | null;
};

function moduleOf(row: ModuleRecord): ModuleRow {
  return {
    id: row.id,
    version: row.version,
    orgId: row.org_id,
    schoolYearId: row.school_year_id,
    title: row.title,
    summary: row.summary,
    state: row.state,
    publishAt: row.publish_at,
    sequential: row.sequential,
    prerequisiteId: row.prerequisite_module_id,
    prerequisiteTitle: row.prerequisite_title,
    authorUserId: row.author_user_id,
    authorNameEn: row.author_en,
    authorNameAr: row.author_ar,
  };
}

export async function moduleById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<ModuleRow | null> {
  const [row] = await tx.execute<ModuleRecord>(sql`
    select ${moduleColumns} from ${moduleFrom}
    where m.tenant_id = ${tenantId}::uuid and m.id = ${id}::uuid and m.status = 'active'`);
  return row ? moduleOf(row) : null;
}

export interface ModuleClass {
  id: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
}

export async function classesOfModule(
  tx: Tx,
  tenantId: string,
  moduleId: string,
): Promise<ModuleClass[]> {
  const rows = await tx.execute<{
    id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    select c.id, c.code, c.title_en, c.title_ar from core.module_classes x
    join core.classes c on c.tenant_id = x.tenant_id and c.id = x.class_id
    where x.tenant_id = ${tenantId}::uuid and x.module_id = ${moduleId}::uuid
      and x.status = 'active'
    order by c.code, c.id`);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    titleEn: row.title_en,
    titleAr: row.title_ar,
  }));
}

export interface ModuleFields {
  title: string;
  summary: string;
  sequential: boolean;
  prerequisiteId: string | null;
}

export async function insertModule(
  tx: Tx,
  input: ModuleFields & {
    tenantId: string;
    schoolId: string;
    yearId: string;
    authorId: string;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.learning_modules (tenant_id, org_id, school_year_id, title, summary,
      sequential, prerequisite_module_id, author_user_id)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.yearId}::uuid, ${input.title},
      ${input.summary}, ${input.sequential}, ${input.prerequisiteId}::uuid, ${input.authorId}::uuid)
    returning id, version`);
  if (!row) throw new Error("module not written");
  return row;
}

export async function updateModule(
  tx: Tx,
  input: ModuleFields & {
    tenantId: string;
    id: string;
    expectedVersion: number;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.learning_modules
    set title = ${input.title}, summary = ${input.summary}, sequential = ${input.sequential},
        prerequisite_module_id = ${input.prerequisiteId}::uuid
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

export async function setModuleState(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    state: ModuleState;
    publishAt: string | null;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.learning_modules
    set state = ${input.state}, publish_at = ${input.publishAt}::timestamptz
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/**
 * Sets the classes a module is for. A class it stays with keeps its place;
 * a new one gets the next place after that class's other modules.
 */
export async function setModuleClasses(
  tx: Tx,
  input: { tenantId: string; moduleId: string; classIds: readonly string[] },
): Promise<void> {
  await tx.execute(sql`
    update core.module_classes set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and module_id = ${input.moduleId}::uuid
      and status = 'active' and not (class_id = any(${uuidArray(input.classIds)}))`);
  await tx.execute(sql`
    insert into core.module_classes (tenant_id, module_id, class_id, position)
    select ${input.tenantId}::uuid, ${input.moduleId}::uuid, c,
      coalesce((select max(x.position) + 1 from core.module_classes x
        where x.tenant_id = ${input.tenantId}::uuid and x.class_id = c and x.status = 'active'), 0)
    from unnest(${uuidArray(input.classIds)}) as c
    where not exists (select 1 from core.module_classes x
      where x.tenant_id = ${input.tenantId}::uuid and x.module_id = ${input.moduleId}::uuid
        and x.class_id = c and x.status = 'active')`);
}

export interface ModuleListRow extends ModuleRow {
  lessons: number;
  classes: ModuleClass[];
}

/** The modules set for any of these classes, newest first, with their lesson counts. */
export async function modulesForClasses(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    classIds: readonly string[];
    authorId: string | null;
  },
): Promise<ModuleListRow[]> {
  const rows = await tx.execute<
    ModuleRecord & {
      lessons: number;
      classes: {
        id: string;
        code: string;
        title_en: string | null;
        title_ar: string | null;
      }[];
    }
  >(sql`
    select ${moduleColumns},
      (select count(*)::int from core.lessons l
        where l.tenant_id = m.tenant_id and l.module_id = m.id and l.status = 'active') as lessons,
      coalesce((select json_agg(json_build_object('id', c.id, 'code', c.code,
          'title_en', c.title_en, 'title_ar', c.title_ar) order by c.code)
        from core.module_classes x join core.classes c on c.tenant_id = x.tenant_id and c.id = x.class_id
        where x.tenant_id = m.tenant_id and x.module_id = m.id and x.status = 'active'), '[]'::json) as classes
    from ${moduleFrom}
    where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.schoolId}::uuid
      and m.status = 'active' and m.state <> 'archived'
      and (exists (select 1 from core.module_classes x
            where x.tenant_id = m.tenant_id and x.module_id = m.id and x.status = 'active'
              and x.class_id = any(${uuidArray(input.classIds)}))
        or m.author_user_id = ${input.authorId}::uuid)
    order by m.date_last_modified desc, m.id
    limit 300`);
  return rows.map((row) => ({
    ...moduleOf(row),
    lessons: row.lessons,
    classes: row.classes.map((item) => ({
      id: item.id,
      code: item.code,
      titleEn: item.title_en,
      titleAr: item.title_ar,
    })),
  }));
}

export interface LessonRow {
  id: string;
  version: number;
  moduleId: string;
  position: number;
  title: string;
  completion: LessonCompletion;
  passScore: number | null;
}

type LessonRecord = {
  id: string;
  version: number;
  module_id: string;
  position: number;
  title: string;
  completion: LessonCompletion;
  pass_score: number | null;
};

function lessonOf(row: LessonRecord): LessonRow {
  return {
    id: row.id,
    version: row.version,
    moduleId: row.module_id,
    position: row.position,
    title: row.title,
    completion: row.completion,
    passScore: row.pass_score,
  };
}

const lessonColumns = sql`l.id, l.version, l.module_id, l.position, l.title, l.completion, l.pass_score`;

export async function lessonsOf(
  tx: Tx,
  tenantId: string,
  moduleId: string,
): Promise<LessonRow[]> {
  const rows = await tx.execute<LessonRecord>(sql`
    select ${lessonColumns} from core.lessons l
    where l.tenant_id = ${tenantId}::uuid and l.module_id = ${moduleId}::uuid and l.status = 'active'
    order by l.position, l.id`);
  return rows.map(lessonOf);
}

export async function lessonById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<LessonRow | null> {
  const [row] = await tx.execute<LessonRecord>(sql`
    select ${lessonColumns} from core.lessons l
    where l.tenant_id = ${tenantId}::uuid and l.id = ${id}::uuid and l.status = 'active'`);
  return row ? lessonOf(row) : null;
}

export interface LessonFields {
  title: string;
  completion: LessonCompletion;
  passScore: number | null;
}

export async function insertLesson(
  tx: Tx,
  input: LessonFields & { tenantId: string; moduleId: string },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.lessons (tenant_id, module_id, position, title, completion, pass_score)
    values (${input.tenantId}::uuid, ${input.moduleId}::uuid,
      coalesce((select max(position) + 1 from core.lessons where tenant_id = ${input.tenantId}::uuid
        and module_id = ${input.moduleId}::uuid and status = 'active'), 0),
      ${input.title}, ${input.completion}, ${input.passScore})
    returning id, version`);
  if (!row) throw new Error("lesson not written");
  return row;
}

export async function updateLesson(
  tx: Tx,
  input: LessonFields & {
    tenantId: string;
    id: string;
    expectedVersion: number;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.lessons
    set title = ${input.title}, completion = ${input.completion}, pass_score = ${input.passScore}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/** Puts the lessons of a module in the given order, numbering them from 0. */
export async function orderLessons(
  tx: Tx,
  input: { tenantId: string; moduleId: string; lessonIds: readonly string[] },
): Promise<void> {
  if (input.lessonIds.length === 0) return;
  await tx.execute(sql`
    update core.lessons l set position = o.position - 1
    from unnest(${uuidArray(input.lessonIds)}) with ordinality as o(id, position)
    where l.tenant_id = ${input.tenantId}::uuid and l.module_id = ${input.moduleId}::uuid
      and l.id = o.id and l.status = 'active' and l.position <> o.position - 1`);
}

export async function removeLesson(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    update core.lessons set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}

export interface ProgressRow {
  lessonId: string;
  studentUserId: string;
  startedAt: string;
  completedAt: string | null;
  completedBy: "student" | "teacher" | null;
  score: number | null;
  attempts: number;
  answers: Record<string, unknown>;
  position: string | null;
}

type ProgressRecord = {
  lesson_id: string;
  student_user_id: string;
  started_at: string;
  completed_at: string | null;
  completed_by: "student" | "teacher" | null;
  score: number | null;
  attempts: number;
  answers: Record<string, unknown>;
  position: string | null;
};

function progressOf(row: ProgressRecord): ProgressRow {
  return {
    lessonId: row.lesson_id,
    studentUserId: row.student_user_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    score: row.score,
    attempts: row.attempts,
    answers: row.answers,
    position: row.position,
  };
}

/** Progress of these students in these lessons. */
export async function progressIn(
  tx: Tx,
  input: {
    tenantId: string;
    lessonIds: readonly string[];
    studentIds: readonly string[];
  },
): Promise<ProgressRow[]> {
  if (input.lessonIds.length === 0 || input.studentIds.length === 0) return [];
  const rows = await tx.execute<ProgressRecord>(sql`
    select lesson_id, student_user_id, ${isoOf(sql`started_at`)} as started_at,
      ${isoOf(sql`completed_at`)} as completed_at, completed_by, score, attempts, answers, position
    from core.lesson_progress
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and lesson_id = any(${uuidArray(input.lessonIds)})
      and student_user_id = any(${uuidArray(input.studentIds)})`);
  return rows.map(progressOf);
}

/**
 * Records what a student did in a lesson, creating their progress the first
 * time. Only the fields given change; `completed` sets or clears the finish.
 */
export async function recordProgress(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    studentId: string;
    answers?: Record<string, unknown>;
    score?: number | null;
    attempt?: boolean;
    position?: string;
    completed?: { by: "student" | "teacher" } | null;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.lesson_progress (tenant_id, lesson_id, student_user_id)
    values (${input.tenantId}::uuid, ${input.lessonId}::uuid, ${input.studentId}::uuid)
    on conflict do nothing`);
  const sets = [
    ...(input.answers ? [sql`answers = ${input.answers}::jsonb`] : []),
    ...(input.score === undefined ? [] : [sql`score = ${input.score}`]),
    ...(input.attempt ? [sql`attempts = attempts + 1`] : []),
    ...(input.position === undefined
      ? []
      : [sql`position = ${input.position}`]),
    ...(input.completed === undefined
      ? []
      : input.completed
        ? [
            sql`completed_at = coalesce(completed_at, statement_timestamp())`,
            sql`completed_by = coalesce(completed_by, ${input.completed.by})`,
          ]
        : [sql`completed_at = null`, sql`completed_by = null`]),
  ];
  if (sets.length === 0) return;
  await tx.execute(sql`
    update core.lesson_progress set ${sql.join(sets, sql`, `)}
    where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
      and student_user_id = ${input.studentId}::uuid and status = 'active'`);
}

/** Whether a student has finished every lesson of a module. */
export async function moduleFinished(
  tx: Tx,
  input: { tenantId: string; moduleId: string; studentId: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ finished: boolean }>(sql`
    select not exists (select 1 from core.lessons l
      where l.tenant_id = ${input.tenantId}::uuid and l.module_id = ${input.moduleId}::uuid
        and l.status = 'active'
        and not exists (select 1 from core.lesson_progress p
          where p.tenant_id = l.tenant_id and p.lesson_id = l.id
            and p.student_user_id = ${input.studentId}::uuid and p.status = 'active'
            and p.completed_at is not null))
      and exists (select 1 from core.lessons l
        where l.tenant_id = ${input.tenantId}::uuid and l.module_id = ${input.moduleId}::uuid
          and l.status = 'active') as finished`);
  return row?.finished ?? false;
}

export interface StudentModuleRow extends ModuleRow {
  lessons: number;
  completed: number;
}

/** The open modules set for any of a student's classes, with how far they are. */
export async function studentModules(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    studentId: string;
    classIds: readonly string[];
  },
): Promise<StudentModuleRow[]> {
  const rows = await tx.execute<
    ModuleRecord & { lessons: number; completed: number }
  >(sql`
    select ${moduleColumns},
      (select count(*)::int from core.lessons l
        where l.tenant_id = m.tenant_id and l.module_id = m.id and l.status = 'active') as lessons,
      (select count(*)::int from core.lessons l
        join core.lesson_progress g on g.tenant_id = l.tenant_id and g.lesson_id = l.id
          and g.student_user_id = ${input.studentId}::uuid and g.status = 'active'
          and g.completed_at is not null
        where l.tenant_id = m.tenant_id and l.module_id = m.id and l.status = 'active') as completed
    from ${moduleFrom}
    where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.schoolId}::uuid
      and m.status = 'active' and m.state = 'published' and m.publish_at <= statement_timestamp()
      and exists (select 1 from core.module_classes x
        where x.tenant_id = m.tenant_id and x.module_id = m.id and x.status = 'active'
          and x.class_id = any(${uuidArray(input.classIds)}))
    order by (select min(x.position) from core.module_classes x
        where x.tenant_id = m.tenant_id and x.module_id = m.id and x.status = 'active'
          and x.class_id = any(${uuidArray(input.classIds)})), m.publish_at, m.id`);
  return rows.map((row) => ({
    ...moduleOf(row),
    lessons: row.lessons,
    completed: row.completed,
  }));
}
