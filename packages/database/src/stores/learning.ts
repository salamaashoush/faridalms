import type { LiveProgress, LiveTry } from "@faridalms/domain/live";

import { YOUNG_STUDENT_GRADES } from "@faridalms/domain/descriptors/catalogue";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type {
  LessonCompletion,
  LessonShareState,
  ModuleState,
  ResponseState,
  RunOutcome,
} from "../tables/learning";

import { isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export type VowelMarks = "shown" | "hidden" | "choice";

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
): Promise<(ModuleClass & { young: boolean })[]> {
  const rows = await tx.execute<{
    id: string;
    code: string;
    title_en: string | null;
    title_ar: string | null;
    young: boolean;
  }>(sql`
    select c.id, c.code, c.title_en, c.title_ar,
      coalesce(d.system_meaning = any(${textArray(YOUNG_STUDENT_GRADES)}), false) as young
    from core.module_classes x
    join core.classes c on c.tenant_id = x.tenant_id and c.id = x.class_id
    left join core.descriptors d on d.tenant_id = c.tenant_id and d.id = c.grade_level_descriptor_id
    where x.tenant_id = ${tenantId}::uuid and x.module_id = ${moduleId}::uuid
      and x.status = 'active'
    order by c.code, c.id`);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    young: row.young,
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
  review: boolean;
  vowelMarks: VowelMarks;
  young: boolean;
  readAlong: boolean;
}

type LessonRecord = {
  id: string;
  version: number;
  module_id: string;
  position: number;
  title: string;
  completion: LessonCompletion;
  pass_score: number | null;
  review: boolean;
  vowel_marks: VowelMarks;
  young: boolean;
  read_along: boolean;
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
    review: row.review,
    vowelMarks: row.vowel_marks,
    young: row.young,
    readAlong: row.read_along,
  };
}

const lessonColumns = sql`l.id, l.version, l.module_id, l.position, l.title, l.completion, l.pass_score, l.review, l.vowel_marks, l.young, l.read_along`;

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
  review: boolean;
  vowelMarks: VowelMarks;
  young: boolean;
  readAlong: boolean;
}

export async function insertLesson(
  tx: Tx,
  input: LessonFields & { tenantId: string; moduleId: string },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.lessons (tenant_id, module_id, position, title, completion, pass_score, review,
      vowel_marks, young, read_along)
    values (${input.tenantId}::uuid, ${input.moduleId}::uuid,
      coalesce((select max(position) + 1 from core.lessons where tenant_id = ${input.tenantId}::uuid
        and module_id = ${input.moduleId}::uuid and status = 'active'), 0),
      ${input.title}, ${input.completion}, ${input.passScore}, ${input.review},
      ${input.vowelMarks}, ${input.young}, ${input.readAlong})
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
    set title = ${input.title}, completion = ${input.completion}, pass_score = ${input.passScore},
      review = ${input.review}, vowel_marks = ${input.vowelMarks}, young = ${input.young},
      read_along = ${input.readAlong}
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
  bestScore: number | null;
  attempts: number;
  position: string | null;
}

type ProgressRecord = {
  lesson_id: string;
  student_user_id: string;
  started_at: string;
  completed_at: string | null;
  completed_by: "student" | "teacher" | null;
  score: number | null;
  best_score: number | null;
  attempts: number;
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
    bestScore: row.best_score,
    attempts: row.attempts,
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
      ${isoOf(sql`completed_at`)} as completed_at, completed_by, score, best_score, attempts, position
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
    score?: number | null;
    /** Start the next attempt, keeping this one's score as the best so far. */
    nextAttempt?: boolean;
    position?: string;
    completed?: { by: "student" | "teacher" } | null;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.lesson_progress (tenant_id, lesson_id, student_user_id)
    values (${input.tenantId}::uuid, ${input.lessonId}::uuid, ${input.studentId}::uuid)
    on conflict do nothing`);
  const sets = [
    ...(input.score === undefined ? [] : [sql`score = ${input.score}`]),
    ...(input.nextAttempt
      ? [sql`attempts = attempts + 1`, sql`best_score = score`]
      : []),
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

export interface WatchRow {
  fileId: string;
  watchedSeconds: number;
  durationSeconds: number;
  positionSeconds: number;
  /** How far the student has played without a gap from the start. */
  reachedSeconds: number;
}

type WatchRecord = {
  file_id: string;
  watched_seconds: number;
  duration_seconds: number;
  position_seconds: number;
  reached_seconds: number;
};

const watchColumns = sql`file_id,
  coalesce((select sum(upper(r) - lower(r)) from unnest(watched) r), 0)::int as watched_seconds,
  duration_seconds, position_seconds,
  coalesce((select upper(r) from unnest(watched) r where lower(r) = 0), 0)::int as reached_seconds`;

const watchOf = (row: WatchRecord): WatchRow => ({
  fileId: row.file_id,
  watchedSeconds: row.watched_seconds,
  durationSeconds: row.duration_seconds,
  positionSeconds: row.position_seconds,
  reachedSeconds: row.reached_seconds,
});

/** The parts of these stretches that one of the stretches before it covers. */
export function replayedWithin(
  ranges: readonly (readonly [number, number])[],
): [number, number][] {
  const seen: [number, number][] = [];
  const again: [number, number][] = [];
  for (const [start, end] of ranges) {
    for (const [from, to] of seen) {
      const low = Math.max(start, from);
      const high = Math.min(end, to);
      if (low < high) again.push([low, high]);
    }
    seen.push([start, end]);
  }
  return again;
}

const multirange = (ranges: readonly (readonly [number, number])[]) =>
  ranges.length === 0
    ? sql`'{}'::int4multirange`
    : sql`int4multirange(${sql.join(
        ranges.map(
          ([start, end]) => sql`int4range(${start}::int, ${end}::int)`,
        ),
        sql`, `,
      )})`;

/**
 * Adds stretches a student played of a recording in a lesson to what they
 * played before, kept within its length, and moves their place in it. A
 * stretch played before, in this report or an earlier one, counts as
 * played again.
 */
export async function recordWatch(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    studentId: string;
    fileId: string;
    ranges: readonly (readonly [number, number])[];
    durationSeconds: number;
    positionSeconds: number;
  },
): Promise<WatchRow> {
  const played = multirange(input.ranges);
  const length = sql`int4multirange(int4range(0, ${input.durationSeconds}::int))`;
  const [row] = await tx.execute<WatchRecord>(sql`
    insert into core.lesson_watches
      (tenant_id, lesson_id, student_user_id, file_id, watched, replayed, duration_seconds, position_seconds)
    values (${input.tenantId}::uuid, ${input.lessonId}::uuid, ${input.studentId}::uuid,
      ${input.fileId}::uuid,
      ${played} * ${length},
      ${multirange(replayedWithin(input.ranges))} * ${length},
      ${input.durationSeconds}::int,
      least(${input.positionSeconds}::int, ${input.durationSeconds}::int))
    on conflict (tenant_id, lesson_id, student_user_id, file_id)
      where status = 'active' do update set
      replayed = (core.lesson_watches.replayed + excluded.replayed
        + (core.lesson_watches.watched * excluded.watched))
        * int4multirange(int4range(0, excluded.duration_seconds)),
      watched = (core.lesson_watches.watched + excluded.watched)
        * int4multirange(int4range(0, excluded.duration_seconds)),
      duration_seconds = excluded.duration_seconds,
      position_seconds = excluded.position_seconds
    returning ${watchColumns}`);
  if (!row) throw new Error("the watch was not recorded");
  return watchOf(row);
}

/** A student's own version of a runnable code block, and the teacher's code it began from. */
export interface KeptCode {
  blockId: string;
  code: string;
  basedOn: string;
}

/** Keeps a student's version of a runnable code block in place of the last. */
export async function keepCode(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    studentId: string;
    blockId: string;
    code: string;
    basedOn: string;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.lesson_code (tenant_id, lesson_id, student_user_id, block_id, code, based_on)
    values (${input.tenantId}::uuid, ${input.lessonId}::uuid, ${input.studentId}::uuid,
      ${input.blockId}, ${input.code}, ${input.basedOn})
    on conflict (tenant_id, lesson_id, student_user_id, block_id)
      where status = 'active' do update set
      code = excluded.code,
      based_on = excluded.based_on`);
}

/** A student's own versions of a lesson's runnable code blocks. */
export async function codesOf(
  tx: Tx,
  input: { tenantId: string; lessonId: string; studentId: string },
): Promise<KeptCode[]> {
  const rows = await tx.execute<{
    block_id: string;
    code: string;
    based_on: string;
  }>(sql`
    select block_id, code, based_on
    from core.lesson_code
    where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
      and student_user_id = ${input.studentId}::uuid and status = 'active'`);
  return rows.map((row) => ({
    blockId: row.block_id,
    code: row.code,
    basedOn: row.based_on,
  }));
}

/** A project's files as a student keeps them. */
export type KeptFiles = { name: string; code: string }[];

/** A student's own project for a question, and the teacher's starter it began from. */
export interface KeptProject {
  blockId: string;
  files: KeptFiles;
  basedOn: string;
  /** The classmate whose project in the gallery this one was begun again from. */
  remixedFrom: string | null;
  keptAt: string;
}

/**
 * Keeps a student's project for a question in place of the last. The files
 * go as text: the driver would send a list as a Postgres array.
 */
export async function keepProject(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    studentId: string;
    blockId: string;
    files: KeptFiles;
    basedOn: string;
    /**
     * Whose project this now begins from: a classmate's, nobody's, or, left
     * out, whoever it began from before.
     */
    remixedFrom?: string | null;
  },
): Promise<void> {
  const remixed = input.remixedFrom ?? null;
  await tx.execute(sql`
    insert into core.lesson_projects (tenant_id, lesson_id, student_user_id, block_id, files,
      based_on, remixed_from_user_id)
    values (${input.tenantId}::uuid, ${input.lessonId}::uuid, ${input.studentId}::uuid,
      ${input.blockId}::uuid, ${JSON.stringify(input.files)}::text::jsonb, ${input.basedOn},
      ${remixed}::uuid)
    on conflict (tenant_id, lesson_id, student_user_id, block_id)
      where status = 'active' do update set
      files = excluded.files,
      based_on = excluded.based_on,
      remixed_from_user_id = case when ${input.remixedFrom === undefined}::boolean
        then core.lesson_projects.remixed_from_user_id else excluded.remixed_from_user_id end`);
}

/** A student's own projects in a lesson, one a question. */
export async function projectsOf(
  tx: Tx,
  input: { tenantId: string; lessonId: string; studentId: string },
): Promise<KeptProject[]> {
  const rows = await tx.execute<{
    block_id: string;
    files: KeptFiles;
    based_on: string;
    remixed_from_user_id: string | null;
    kept_at: string;
  }>(sql`
    select block_id, files, based_on, remixed_from_user_id,
      ${isoOf(sql`date_last_modified`)} as kept_at
    from core.lesson_projects
    where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
      and student_user_id = ${input.studentId}::uuid and status = 'active'`);
  return rows.map((row) => ({
    blockId: row.block_id,
    files: row.files,
    basedOn: row.based_on,
    remixedFrom: row.remixed_from_user_id,
    keptAt: row.kept_at,
  }));
}

/** A student's project as it stood when last kept, for the teacher in the room. */
export interface LiveProject {
  lessonId: string;
  blockId: string;
  studentId: string;
  files: KeptFiles;
  keptAt: string;
}

/** The projects some students have changed in some lessons since a moment. */
export async function projectsSince(
  tx: Tx,
  input: {
    tenantId: string;
    lessonIds: readonly string[];
    studentIds: readonly string[];
    since: string;
  },
): Promise<LiveProject[]> {
  if (input.lessonIds.length === 0 || input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    lesson_id: string;
    block_id: string;
    student_user_id: string;
    files: KeptFiles;
    kept_at: string;
  }>(sql`
    select lesson_id, block_id, student_user_id, files,
      ${isoOf(sql`date_last_modified`)} as kept_at
    from core.lesson_projects
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and lesson_id = any(${uuidArray(input.lessonIds)})
      and student_user_id = any(${uuidArray(input.studentIds)})
      and date_last_modified >= ${input.since}::timestamptz
    order by student_user_id, lesson_id, block_id`);
  return rows.map((row) => ({
    lessonId: row.lesson_id,
    blockId: row.block_id,
    studentId: row.student_user_id,
    files: row.files,
    keptAt: row.kept_at,
  }));
}

/** A coding project a student saved in a lesson, as it last stood. */
export interface LiveStudio {
  lessonId: string;
  blockId: string;
  studentId: string;
  projectFileId: string;
  thumbnailFileId: string | null;
  savedAt: string;
}

/** The coding projects some students have saved in some lessons since a moment, each as last saved. */
export async function studiosSince(
  tx: Tx,
  input: {
    tenantId: string;
    lessonIds: readonly string[];
    studentIds: readonly string[];
    since: string;
  },
): Promise<LiveStudio[]> {
  if (input.lessonIds.length === 0 || input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    lesson_id: string;
    block_id: string;
    student_user_id: string;
    project: string;
    thumbnail: string | null;
    saved_at: string;
  }>(sql`
    select distinct on (student_user_id, lesson_id, block_id)
      lesson_id, block_id, student_user_id,
      response->'project'->>'fileId' as project,
      response->'thumbnail'->>'fileId' as thumbnail,
      ${isoOf(sql`created_at`)} as saved_at
    from core.lesson_responses
    where tenant_id = ${input.tenantId}::uuid and kind = 'scratch'
      and lesson_id = any(${uuidArray(input.lessonIds)})
      and student_user_id = any(${uuidArray(input.studentIds)})
      and created_at >= ${input.since}::timestamptz
    order by student_user_id, lesson_id, block_id, created_at desc, try desc`);
  return rows.map((row) => ({
    lessonId: row.lesson_id,
    blockId: row.block_id,
    studentId: row.student_user_id,
    projectFileId: row.project,
    thumbnailFileId: row.thumbnail,
    savedAt: row.saved_at,
  }));
}

/**
 * The question and student whose project in a lesson's class gallery, shown
 * by their teacher, is made of a file; null when no shown project is.
 */
export async function shownWith(
  tx: Tx,
  input: { tenantId: string; lessonId: string; fileId: string },
): Promise<{ blockId: string; studentId: string } | null> {
  const [row] = await tx.execute<{
    block_id: string;
    student_user_id: string;
  }>(sql`
    select block_id, student_user_id from core.lesson_shares
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and lesson_id = ${input.lessonId}::uuid and state = 'shown'
      and ${input.fileId} in (
        response->'project'->>'fileId', response->'thumbnail'->>'fileId')
    limit 1`);
  return row ? { blockId: row.block_id, studentId: row.student_user_id } : null;
}

/** A project offered to a question's class gallery, and how it stands. */
export interface StoredShare {
  lessonId: string;
  blockId: string;
  studentId: string;
  response: Record<string, unknown>;
  state: LessonShareState;
}

const shareColumns = sql`lesson_id, block_id, student_user_id, response, state`;
type ShareRecord = {
  lesson_id: string;
  block_id: string;
  student_user_id: string;
  response: Record<string, unknown>;
  state: LessonShareState;
};
const shareOf = (row: ShareRecord): StoredShare => ({
  lessonId: row.lesson_id,
  blockId: row.block_id,
  studentId: row.student_user_id,
  response: row.response,
  state: row.state,
});

/**
 * Offers a student's project to a question's gallery, in place of what they
 * offered before: it waits for the teacher again, whatever stood there.
 */
export async function offerShare(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    blockId: string;
    studentId: string;
    response: Record<string, unknown>;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.lesson_shares (tenant_id, lesson_id, student_user_id, block_id, response)
    values (${input.tenantId}::uuid, ${input.lessonId}::uuid, ${input.studentId}::uuid,
      ${input.blockId}::uuid, ${input.response}::jsonb)
    on conflict (tenant_id, lesson_id, student_user_id, block_id)
      where status = 'active' do update set
      response = excluded.response, state = 'offered', decided_by_user_id = null`);
}

/** Takes a student's project out of a question's gallery; false when none was there. */
export async function withdrawShare(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    blockId: string;
    studentId: string;
  },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.lesson_shares set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
      and block_id = ${input.blockId}::uuid and student_user_id = ${input.studentId}::uuid
      and status = 'active'
    returning id`);
  return rows.length > 0;
}

/** A teacher shows an offered project to the class, or keeps it out; false when none was offered. */
export async function decideShare(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    blockId: string;
    studentId: string;
    state: "shown" | "declined";
    userId: string;
  },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.lesson_shares set state = ${input.state}, decided_by_user_id = ${input.userId}::uuid
    where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
      and block_id = ${input.blockId}::uuid and student_user_id = ${input.studentId}::uuid
      and status = 'active'
    returning id`);
  return rows.length > 0;
}

/** The projects some students offered to the galleries of some lessons' questions. */
export async function sharesOf(
  tx: Tx,
  input: {
    tenantId: string;
    lessonIds: readonly string[];
    studentIds: readonly string[];
    blockId?: string;
  },
): Promise<StoredShare[]> {
  if (input.lessonIds.length === 0 || input.studentIds.length === 0) return [];
  const rows = await tx.execute<ShareRecord>(sql`
    select ${shareColumns} from core.lesson_shares
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and lesson_id = any(${uuidArray(input.lessonIds)})
      and student_user_id = any(${uuidArray(input.studentIds)})
      ${input.blockId ? sql`and block_id = ${input.blockId}::uuid` : sql``}
    order by created_at, id`);
  return rows.map(shareOf);
}

/** How much of each recording in a lesson a student has played. */
export async function watchesOf(
  tx: Tx,
  input: { tenantId: string; lessonId: string; studentId: string },
): Promise<WatchRow[]> {
  const rows = await tx.execute<WatchRecord>(sql`
    select ${watchColumns}
    from core.lesson_watches
    where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
      and student_user_id = ${input.studentId}::uuid and status = 'active'`);
  return rows.map(watchOf);
}

/** The stretches each of these students played of each recording in these lessons. */
export async function watchRowsIn(
  tx: Tx,
  input: {
    tenantId: string;
    lessonIds: readonly string[];
    studentIds: readonly string[];
  },
): Promise<
  {
    lessonId: string;
    studentId: string;
    fileId: string;
    ranges: [number, number][];
    replayed: [number, number][];
    durationSeconds: number;
  }[]
> {
  if (input.lessonIds.length === 0 || input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    lesson_id: string;
    student_user_id: string;
    file_id: string;
    ranges: [number, number][];
    replayed: [number, number][];
    duration_seconds: number;
  }>(sql`
    select lesson_id, student_user_id, file_id, duration_seconds,
      coalesce((select jsonb_agg(jsonb_build_array(lower(r), upper(r)) order by lower(r))
        from unnest(watched) r), '[]'::jsonb) as ranges,
      coalesce((select jsonb_agg(jsonb_build_array(lower(r), upper(r)) order by lower(r))
        from unnest(replayed) r), '[]'::jsonb) as replayed
    from core.lesson_watches
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and lesson_id = any(${uuidArray(input.lessonIds)})
      and student_user_id = any(${uuidArray(input.studentIds)})`);
  return rows.map((row) => ({
    lessonId: row.lesson_id,
    studentId: row.student_user_id,
    fileId: row.file_id,
    ranges: row.ranges,
    replayed: row.replayed,
    durationSeconds: row.duration_seconds,
  }));
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

export interface StoredResponse {
  id: string;
  blockId: string;
  attempt: number;
  try: number;
  kind: string;
  response: Record<string, unknown>;
  fraction: number | null;
  state: ResponseState;
  feedback: string | null;
  documentVersionId: string | null;
  createdAt: string;
}

type ResponseRecord = {
  id: string;
  block_id: string;
  attempt: number;
  try: number;
  kind: string;
  response: Record<string, unknown>;
  fraction: string | number | null;
  state: ResponseState;
  feedback: string | null;
  document_version_id: string | null;
  created_at: string;
  student_user_id: string;
  lesson_id: string;
};

const responseOf = (row: ResponseRecord): StoredResponse => ({
  id: row.id,
  blockId: row.block_id,
  attempt: row.attempt,
  try: row.try,
  kind: row.kind,
  response: row.response,
  fraction: row.fraction === null ? null : Number(row.fraction),
  state: row.state,
  feedback: row.feedback,
  documentVersionId: row.document_version_id,
  createdAt: row.created_at,
});

/** A student's rows in one attempt at a lesson, in the order given. */
export async function responsesOf(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    studentId: string;
    attempt: number;
  },
): Promise<StoredResponse[]> {
  const rows = await tx.execute<ResponseRecord>(sql`
    select id, block_id, attempt, try, kind, response, fraction, state, feedback,
      document_version_id, ${isoOf(sql`created_at`)} as created_at, student_user_id, lesson_id
    from core.lesson_responses
    where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
      and student_user_id = ${input.studentId}::uuid and attempt = ${input.attempt}
    order by created_at, try, id`);
  return rows.map(responseOf);
}

/**
 * Every student's rows in their first attempt at some lessons, which show
 * what a class made of each question before any second go.
 */
export async function firstAttempts(
  tx: Tx,
  input: {
    tenantId: string;
    lessonIds: readonly string[];
    studentIds: readonly string[];
  },
): Promise<(StoredResponse & { lessonId: string; studentId: string })[]> {
  if (input.lessonIds.length === 0 || input.studentIds.length === 0) return [];
  const rows = await tx.execute<ResponseRecord>(sql`
    select id, block_id, attempt, try, kind, response, fraction, state, feedback,
      document_version_id, ${isoOf(sql`created_at`)} as created_at, student_user_id, lesson_id
    from core.lesson_responses
    where tenant_id = ${input.tenantId}::uuid and attempt = 1
      and lesson_id = any(${uuidArray(input.lessonIds)})
      and student_user_id = any(${uuidArray(input.studentIds)})
    order by created_at, try, id`);
  return rows.map((row) => ({
    ...responseOf(row),
    lessonId: row.lesson_id,
    studentId: row.student_user_id,
  }));
}

export async function insertResponse(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    documentVersionId: string | null;
    studentId: string;
    blockId: string;
    attempt: number;
    try: number;
    kind: string;
    response: Record<string, unknown>;
    fraction: number | null;
    state: ResponseState;
    feedback?: string | null;
    markedBy?: string | null;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.lesson_responses (tenant_id, lesson_id, document_version_id, student_user_id,
      block_id, attempt, try, kind, response, fraction, state, feedback, marked_by_user_id)
    values (${input.tenantId}::uuid, ${input.lessonId}::uuid, ${input.documentVersionId}::uuid,
      ${input.studentId}::uuid, ${input.blockId}::uuid, ${input.attempt}, ${input.try}, ${input.kind},
      ${input.response}::jsonb, ${input.fraction}, ${input.state}, ${input.feedback ?? null},
      ${input.markedBy ?? null}::uuid)`);
}

/** One student's rows for one question, every attempt, in the order given. */
export async function responsesTo(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    studentId: string;
    blockId: string;
  },
): Promise<StoredResponse[]> {
  const rows = await tx.execute<ResponseRecord>(sql`
    select id, block_id, attempt, try, kind, response, fraction, state, feedback,
      document_version_id, ${isoOf(sql`created_at`)} as created_at, student_user_id, lesson_id
    from core.lesson_responses
    where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
      and student_user_id = ${input.studentId}::uuid and block_id = ${input.blockId}::uuid
    order by created_at, try, id`);
  return rows.map(responseOf);
}

/** A run of a code exercise, as its teacher replays it. */
export interface StoredRun {
  attempt: number;
  code: string;
  input: string;
  outcome: RunOutcome;
  error: string | null;
  output: string;
  ranAt: string;
}

/** Runs kept of one question in one attempt; a student's runs past these go unkept. */
const RUNS_KEPT = 300;

/**
 * Keeps a student's run of a code exercise, unless it ended as the last one
 * kept did with the same code and input, which would only repeat it, or the
 * student has already run it as often as is kept. Says whether it was kept.
 */
export async function recordRun(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    studentId: string;
    blockId: string;
    attempt: number;
    code: string;
    input: string;
    outcome: RunOutcome;
    error: string | null;
    output: string;
  },
): Promise<boolean> {
  const mine = sql`tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
    and student_user_id = ${input.studentId}::uuid and block_id = ${input.blockId}::uuid
    and attempt = ${input.attempt}`;
  const rows = await tx.execute<{ id: string }>(sql`
    insert into core.lesson_runs (tenant_id, lesson_id, student_user_id, block_id, attempt,
      code, input, outcome, error, output)
    select ${input.tenantId}::uuid, ${input.lessonId}::uuid, ${input.studentId}::uuid,
      ${input.blockId}::uuid, ${input.attempt}, ${input.code}, ${input.input}, ${input.outcome},
      ${input.error}, ${input.output}
    where (select count(*) from core.lesson_runs where ${mine}) < ${RUNS_KEPT}
      and not exists (
        select 1 from (
          select code, input, outcome from core.lesson_runs where ${mine}
          order by created_at desc, id desc limit 1) last
        where last.code = ${input.code} and last.input = ${input.input}
          and last.outcome = ${input.outcome})
    returning id`);
  return rows.length > 0;
}

/** How often each student ran each code exercise of some lessons, every attempt. */
export async function runCounts(
  tx: Tx,
  input: {
    tenantId: string;
    lessonIds: readonly string[];
    studentIds: readonly string[];
  },
): Promise<{ blockId: string; studentId: string; runs: number }[]> {
  if (input.lessonIds.length === 0 || input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    block_id: string;
    student_user_id: string;
    runs: number;
  }>(sql`
    select block_id, student_user_id, count(*)::int as runs
    from core.lesson_runs
    where tenant_id = ${input.tenantId}::uuid
      and lesson_id = any(${uuidArray(input.lessonIds)})
      and student_user_id = any(${uuidArray(input.studentIds)})
    group by block_id, student_user_id`);
  return rows.map((row) => ({
    blockId: row.block_id,
    studentId: row.student_user_id,
    runs: row.runs,
  }));
}

/** One student's runs of one question, every attempt, oldest first. */
export async function runsOf(
  tx: Tx,
  input: {
    tenantId: string;
    lessonId: string;
    studentId: string;
    blockId: string;
  },
): Promise<StoredRun[]> {
  const rows = await tx.execute<{
    attempt: number;
    code: string;
    input: string;
    outcome: RunOutcome;
    error: string | null;
    output: string;
    ran_at: string;
  }>(sql`
    select attempt, code, input, outcome, error, output, ${isoOf(sql`created_at`)} as ran_at
    from core.lesson_runs
    where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
      and student_user_id = ${input.studentId}::uuid and block_id = ${input.blockId}::uuid
    order by created_at, id`);
  return rows.map((row) => ({
    attempt: row.attempt,
    code: row.code,
    input: row.input,
    outcome: row.outcome,
    error: row.error,
    output: row.output,
    ranAt: row.ran_at,
  }));
}

export interface AnswerToMark {
  lessonId: string;
  studentId: string;
  blockId: string;
  attempt: number;
  try: number;
  text: string;
  /** A spoken answer's recording, how long it runs, and whether it is on video. */
  recording: { fileId: string; seconds: number; video?: boolean } | null;
  /** A drawn or photographed answer. */
  picture: { fileId: string } | null;
  /** A coding answer's project, and its stage when the student saved it. */
  project: { fileId: string } | null;
  thumbnail: { fileId: string } | null;
  /** A project answer's files as the student handed them in. */
  files: KeptFiles | null;
  /** The classmate whose project in the gallery a project answer began from. */
  remixOf: string | null;
  sentAt: string;
  /** The teacher's latest mark on this answer, if any. */
  fraction: number | null;
  feedback: string | null;
  marked: boolean;
}

/**
 * The latest answer of each student to each question their teacher marks,
 * written or a project, in their current attempt, with its mark if
 * it has one.
 */
export async function answersToMark(
  tx: Tx,
  input: {
    tenantId: string;
    lessonIds: readonly string[];
    studentIds: readonly string[];
  },
): Promise<AnswerToMark[]> {
  if (input.lessonIds.length === 0 || input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    lesson_id: string;
    student_user_id: string;
    block_id: string;
    attempt: number;
    try: number;
    text: string | null;
    recording: { fileId: string; seconds: number; video?: boolean } | null;
    picture: { fileId: string } | null;
    project: { fileId: string } | null;
    thumbnail: { fileId: string } | null;
    files: KeptFiles | null;
    remix_of: string | null;
    sent_at: string;
    fraction: string | number | null;
    feedback: string | null;
    marked: boolean;
  }>(sql`
    with current as (
      select p.lesson_id, p.student_user_id, p.attempts from core.lesson_progress p
      where p.tenant_id = ${input.tenantId}::uuid and p.status = 'active'
        and p.lesson_id = any(${uuidArray(input.lessonIds)})
        and p.student_user_id = any(${uuidArray(input.studentIds)})
    ), latest as (
      select distinct on (r.lesson_id, r.student_user_id, r.block_id)
        r.lesson_id, r.student_user_id, r.block_id, r.attempt, r.try, r.response->>'text' as text,
        r.response->'recording' as recording, r.response->'picture' as picture,
        r.response->'project' as project, r.response->'thumbnail' as thumbnail,
        r.response->'files' as files, r.response->>'remixOf' as remix_of,
        ${isoOf(sql`r.created_at`)} as sent_at
      from core.lesson_responses r
      join current c on c.lesson_id = r.lesson_id and c.student_user_id = r.student_user_id
        and c.attempts = r.attempt
      where r.tenant_id = ${input.tenantId}::uuid and r.kind in ('written', 'scratch', 'project')
        and r.state in ('answered', 'needs_marking')
      order by r.lesson_id, r.student_user_id, r.block_id, r.try desc, r.created_at desc
    )
    select l.*, m.fraction, m.feedback, m.id is not null as marked
    from latest l
    left join lateral (
      select id, fraction, feedback from core.lesson_responses x
      where x.tenant_id = ${input.tenantId}::uuid and x.lesson_id = l.lesson_id
        and x.student_user_id = l.student_user_id and x.block_id = l.block_id
        and x.attempt = l.attempt and x.try = l.try and x.state = 'marked'
      order by x.created_at desc limit 1) m on true
    order by l.sent_at`);
  return rows.map((row) => ({
    lessonId: row.lesson_id,
    studentId: row.student_user_id,
    blockId: row.block_id,
    attempt: row.attempt,
    try: row.try,
    text: row.text ?? "",
    recording: row.recording ?? null,
    picture: row.picture ?? null,
    project: row.project ?? null,
    thumbnail: row.thumbnail ?? null,
    files: row.files ?? null,
    remixOf: row.remix_of,
    sentAt: row.sent_at,
    fraction: row.fraction === null ? null : Number(row.fraction),
    feedback: row.feedback,
    marked: row.marked,
  }));
}

/** The lessons among these that have a published version students can play. */
export async function publishedLessons(
  tx: Tx,
  tenantId: string,
  lessonIds: readonly string[],
): Promise<Set<string>> {
  if (lessonIds.length === 0) return new Set();
  const rows = await tx.execute<{ host_id: string }>(sql`
    select d.host_id from core.documents d
    where d.tenant_id = ${tenantId}::uuid and d.host_type = 'lesson' and d.status = 'active'
      and d.translation_of_id is null and d.host_id = any(${uuidArray(lessonIds)})
      and exists (select 1 from core.document_versions v
        where v.tenant_id = d.tenant_id and v.document_id = d.id and v.reason = 'publish'
          and v.redacted_at is null)`);
  return new Set(rows.map((row) => row.host_id));
}

/** Whether a class's lessons tick and chime as its children answer. */
export async function lessonSoundsOf(
  tx: Tx,
  tenantId: string,
  classId: string,
): Promise<boolean | null> {
  const [row] = await tx.execute<{ lesson_sounds: boolean }>(sql`
    select lesson_sounds from core.classes
    where tenant_id = ${tenantId}::uuid and id = ${classId}::uuid and status = 'active'`);
  return row ? row.lesson_sounds : null;
}

export async function setLessonSounds(
  tx: Tx,
  input: { tenantId: string; classId: string; on: boolean },
) {
  await tx.execute(sql`
    update core.classes set lesson_sounds = ${input.on}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.classId}::uuid and status = 'active'`);
}

/**
 * Whether a student plays a module's lessons without sound effects: one of
 * the module's classes they sit in has them off. A subject class follows
 * its homeroom's roster, as everywhere else.
 */
export async function quietLessons(
  tx: Tx,
  input: { tenantId: string; moduleId: string; studentId: string; on: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ quiet: boolean }>(sql`
    select exists (
      select 1 from core.module_classes x
      join core.classes c on c.tenant_id = x.tenant_id and c.id = x.class_id and c.status = 'active'
      join core.enrollments e on e.tenant_id = c.tenant_id
        and e.class_id = coalesce(c.homeroom_class_id, c.id)
        and e.user_id = ${input.studentId}::uuid and e.role = 'student' and e.status = 'active'
        and e.valid_during @> ${input.on}::date
      where x.tenant_id = ${input.tenantId}::uuid and x.module_id = ${input.moduleId}::uuid
        and x.status = 'active' and not c.lesson_sounds) as quiet`);
  return row?.quiet ?? false;
}

export interface LiveActivity {
  progress: LiveProgress[];
  tries: LiveTry[];
}

/**
 * What students did in some lessons since a moment: the progress they
 * touched and each try they made, a teacher's marks left out.
 */
export async function liveActivity(
  tx: Tx,
  input: {
    tenantId: string;
    lessonIds: readonly string[];
    studentIds: readonly string[];
    since: string;
  },
): Promise<LiveActivity> {
  if (input.lessonIds.length === 0 || input.studentIds.length === 0)
    return { progress: [], tries: [] };
  const progress = await tx.execute<{
    lesson_id: string;
    student_user_id: string;
    attempts: number;
    completed_at: string | null;
    touched_at: string;
  }>(sql`
    select lesson_id, student_user_id, attempts,
      ${isoOf(sql`completed_at`)} as completed_at, ${isoOf(sql`date_last_modified`)} as touched_at
    from core.lesson_progress
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and lesson_id = any(${uuidArray(input.lessonIds)})
      and student_user_id = any(${uuidArray(input.studentIds)})
      and date_last_modified >= ${input.since}::timestamptz`);
  const tries = await tx.execute<{
    lesson_id: string;
    student_user_id: string;
    block_id: string;
    attempt: number;
    state: ResponseState;
    fraction: string | number | null;
    created_at: string;
  }>(sql`
    select lesson_id, student_user_id, block_id, attempt, state, fraction,
      ${isoOf(sql`created_at`)} as created_at
    from core.lesson_responses
    where tenant_id = ${input.tenantId}::uuid and marked_by_user_id is null
      and lesson_id = any(${uuidArray(input.lessonIds)})
      and student_user_id = any(${uuidArray(input.studentIds)})
      and created_at >= ${input.since}::timestamptz
    order by created_at, try, id`);
  return {
    progress: progress.map((row) => ({
      studentId: row.student_user_id,
      lessonId: row.lesson_id,
      attempts: row.attempts,
      completedAt: row.completed_at,
      touchedAt: row.touched_at,
    })),
    tries: tries.map((row) => ({
      studentId: row.student_user_id,
      lessonId: row.lesson_id,
      blockId: row.block_id,
      attempt: row.attempt,
      at: row.created_at,
      outcome:
        row.state === "revealed"
          ? "shown"
          : row.state === "needs_marking"
            ? "sent"
            : Number(row.fraction) === 1
              ? "right"
              : "wrong",
    })),
  };
}
