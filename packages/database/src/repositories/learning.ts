import type { AssessmentScope } from "@faridalms/domain/academic-access";
import type {
  AnswerQuizInput,
  LessonAnswers,
  LessonBlock,
  LessonDocument,
  ModuleRevisionInput,
  SaveLessonInput,
  SaveModuleInput,
  SchoolFeature,
} from "@faridalms/domain/learning";

import { canAssessOffering } from "@faridalms/domain/academic-access";
import {
  SCHOOL_FEATURES,
  lessonCanComplete,
  lessonFileIds,
  lessonSummary,
  modulePublishIssues,
  quizIsCorrect,
} from "@faridalms/domain/learning";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "../index";

import { schema } from "../index";
import { ManagementError } from "./management";

const {
  schoolFeatures,
  learningModules,
  lessons,
  lessonFiles,
  lessonProgress,
} = schema;

export interface LearningActor {
  userId: string;
  scope: AssessmentScope;
}

// --- features -------------------------------------------------------------------

export async function getFeatures(
  db: Database,
): Promise<Record<SchoolFeature, boolean>> {
  const rows = await db.select().from(schoolFeatures);
  const result = {} as Record<SchoolFeature, boolean>;
  for (const key of SCHOOL_FEATURES)
    result[key] = rows.find((row) => row.key === key)?.enabled ?? false;
  return result;
}

export async function setFeature(
  db: Database,
  key: SchoolFeature,
  enabled: boolean,
  userId: string,
) {
  await db
    .insert(schoolFeatures)
    .values({ key, enabled, updatedById: userId })
    .onConflictDoUpdate({
      target: schoolFeatures.key,
      set: { enabled, updatedById: userId, updatedAt: new Date() },
    });
  return getFeatures(db);
}

// --- authoring ------------------------------------------------------------------

async function requireOffering(
  db: Database,
  classId: string,
  subjectId: string,
  actor: LearningActor,
) {
  const offering = await db.query.classSubjects.findFirst({
    where: { classId, subjectId },
    columns: { id: true, teacherId: true },
  });
  if (!offering)
    throw new ManagementError("BAD_REQUEST", "learning.subject_not_taught");
  if (!canAssessOffering(actor.scope, offering.teacherId))
    throw new ManagementError("FORBIDDEN", "learning.responsibility");
  return offering;
}

const moduleWith = {
  class: { columns: { id: true, name: true } },
  subject: { columns: { id: true, name: true, nameAr: true, icon: true } },
  author: { columns: { id: true, name: true } },
} as const;

export async function listModulesForTeacher(
  db: Database,
  classIds: string[],
  scope: AssessmentScope,
) {
  if (classIds.length === 0) return [];
  const [rows, offerings] = await Promise.all([
    db.query.learningModules.findMany({
      where: { classId: { in: classIds } },
      with: { ...moduleWith, lessons: { columns: { id: true } } },
      orderBy: { updatedAt: "desc", id: "asc" },
    }),
    db.query.classSubjects.findMany({
      where: { classId: { in: classIds } },
      columns: { classId: true, subjectId: true, teacherId: true },
    }),
  ]);
  const teacherOf = new Map(
    offerings.map((row) => [`${row.classId}:${row.subjectId}`, row.teacherId]),
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    revision: row.revision,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    class: row.class,
    subject: row.subject,
    author: row.author,
    lessonCount: row.lessons.length,
    canAuthor: canAssessOffering(
      scope,
      teacherOf.get(`${row.classId}:${row.subjectId}`) ?? null,
    ),
  }));
}

export async function moduleForAuthoring(
  db: Database,
  id: string,
  actor: LearningActor,
) {
  const row = await db.query.learningModules.findFirst({
    where: { id },
    with: {
      ...moduleWith,
      lessons: {
        columns: {
          id: true,
          title: true,
          position: true,
          revision: true,
          updatedAt: true,
          document: true,
        },
        orderBy: { position: "asc", createdAt: "asc" },
      },
    },
  });
  if (!row) throw new ManagementError("NOT_FOUND", "learning.not_found");
  await requireOffering(db, row.classId, row.subjectId, actor);
  return {
    ...row,
    lessons: row.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      position: lesson.position,
      revision: lesson.revision,
      updatedAt: lesson.updatedAt,
      blocks: lesson.document.blocks.length,
      quizzes: lesson.document.blocks.filter((block) => block.type === "quiz")
        .length,
    })),
    issues: modulePublishIssues(row),
  };
}

export async function saveModule(
  db: Database,
  input: SaveModuleInput,
  actor: LearningActor,
) {
  await requireOffering(db, input.classId, input.subjectId, actor);
  const { expectedRevision, ...values } = input;
  if (expectedRevision === 0) {
    const [created] = await db
      .insert(learningModules)
      .values({ ...values, authorId: actor.userId })
      .onConflictDoNothing()
      .returning({
        id: learningModules.id,
        revision: learningModules.revision,
      });
    if (!created)
      throw new ManagementError("CONFLICT", "learning.revision_conflict");
    return created;
  }
  const existing = await db.query.learningModules.findFirst({
    where: { id: input.id },
    columns: { classId: true, subjectId: true },
  });
  if (!existing) throw new ManagementError("NOT_FOUND", "learning.not_found");
  await requireOffering(db, existing.classId, existing.subjectId, actor);
  const [updated] = await db
    .update(learningModules)
    .set({
      title: values.title,
      summary: values.summary,
      subjectId: values.subjectId,
      revision: expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningModules.id, input.id),
        eq(learningModules.revision, expectedRevision),
      ),
    )
    .returning({ id: learningModules.id, revision: learningModules.revision });
  if (!updated)
    throw new ManagementError("CONFLICT", "learning.revision_conflict");
  return updated;
}

export async function publishModule(
  db: Database,
  input: ModuleRevisionInput,
  actor: LearningActor,
  now: Date,
) {
  const row = await db.query.learningModules.findFirst({
    where: { id: input.id },
    with: { lessons: { columns: { document: true } } },
  });
  if (!row) throw new ManagementError("NOT_FOUND", "learning.not_found");
  await requireOffering(db, row.classId, row.subjectId, actor);
  if (row.revision !== input.expectedRevision)
    throw new ManagementError("CONFLICT", "learning.revision_conflict");
  if (modulePublishIssues(row).length > 0)
    throw new ManagementError("BAD_REQUEST", "learning.incomplete");
  const [updated] = await db
    .update(learningModules)
    .set({
      status: "published",
      publishedAt: row.publishedAt ?? now,
      revision: row.revision + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(learningModules.id, row.id),
        eq(learningModules.revision, row.revision),
      ),
    )
    .returning({ id: learningModules.id, revision: learningModules.revision });
  if (!updated)
    throw new ManagementError("CONFLICT", "learning.revision_conflict");
  return updated;
}

export async function unpublishModule(
  db: Database,
  input: ModuleRevisionInput,
  actor: LearningActor,
) {
  const row = await db.query.learningModules.findFirst({
    where: { id: input.id },
    columns: { classId: true, subjectId: true, revision: true },
  });
  if (!row) throw new ManagementError("NOT_FOUND", "learning.not_found");
  await requireOffering(db, row.classId, row.subjectId, actor);
  const [updated] = await db
    .update(learningModules)
    .set({
      status: "draft",
      revision: input.expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningModules.id, input.id),
        eq(learningModules.revision, input.expectedRevision),
      ),
    )
    .returning({ id: learningModules.id, revision: learningModules.revision });
  if (!updated)
    throw new ManagementError("CONFLICT", "learning.revision_conflict");
  return updated;
}

async function moduleOfLesson(db: Database, lessonId: string) {
  return db.query.lessons.findFirst({
    where: { id: lessonId },
    with: {
      module: {
        columns: {
          id: true,
          classId: true,
          subjectId: true,
          title: true,
          status: true,
        },
      },
    },
  });
}

export async function lessonForAuthoring(
  db: Database,
  id: string,
  actor: LearningActor,
) {
  const row = await moduleOfLesson(db, id);
  if (!row?.module)
    throw new ManagementError("NOT_FOUND", "learning.not_found");
  await requireOffering(db, row.module.classId, row.module.subjectId, actor);
  return row;
}

export async function saveLesson(
  db: Database,
  input: SaveLessonInput,
  actor: LearningActor,
) {
  const module = await db.query.learningModules.findFirst({
    where: { id: input.moduleId },
    columns: { id: true, classId: true, subjectId: true },
  });
  if (!module) throw new ManagementError("NOT_FOUND", "learning.not_found");
  await requireOffering(db, module.classId, module.subjectId, actor);
  const fileIds = [...new Set(lessonFileIds(input.document))];
  if (fileIds.length > 0) {
    const ready = await db.query.privateFiles.findMany({
      where: { id: { in: fileIds }, purpose: "lesson_media", state: "ready" },
      columns: { id: true },
    });
    if (ready.length !== fileIds.length)
      throw new ManagementError("BAD_REQUEST", "learning.media_missing");
  }
  return db.transaction(async (tx) => {
    const { expectedRevision, moduleId, ...values } = input;
    let saved: { id: string; revision: number } | undefined;
    if (expectedRevision === 0) {
      [saved] = await tx
        .insert(lessons)
        .values({ ...values, moduleId })
        .onConflictDoNothing()
        .returning({ id: lessons.id, revision: lessons.revision });
      if (!saved)
        throw new ManagementError("CONFLICT", "learning.revision_conflict");
    } else {
      [saved] = await tx
        .update(lessons)
        .set({
          ...values,
          revision: expectedRevision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(lessons.id, input.id),
            eq(lessons.moduleId, moduleId),
            eq(lessons.revision, expectedRevision),
          ),
        )
        .returning({ id: lessons.id, revision: lessons.revision });
      if (!saved) {
        const exists = await tx.query.lessons.findFirst({
          where: { id: input.id },
          columns: { id: true },
        });
        if (!exists)
          throw new ManagementError("NOT_FOUND", "learning.not_found");
        throw new ManagementError("CONFLICT", "learning.revision_conflict");
      }
    }
    await tx.delete(lessonFiles).where(eq(lessonFiles.lessonId, saved.id));
    if (fileIds.length > 0)
      await tx
        .insert(lessonFiles)
        .values(fileIds.map((fileId) => ({ lessonId: saved.id, fileId })));
    await tx
      .update(learningModules)
      .set({ updatedAt: new Date() })
      .where(eq(learningModules.id, moduleId));
    return saved;
  });
}

export async function deleteLesson(
  db: Database,
  id: string,
  actor: LearningActor,
) {
  const row = await moduleOfLesson(db, id);
  if (!row?.module)
    throw new ManagementError("NOT_FOUND", "learning.not_found");
  await requireOffering(db, row.module.classId, row.module.subjectId, actor);
  await db.delete(lessons).where(eq(lessons.id, id));
  return { id };
}

// --- learning ---------------------------------------------------------------------

async function currentClassIds(db: Database, studentId: string, today: string) {
  const rows = await db.query.enrolments.findMany({
    columns: { classId: true },
    where: {
      studentId,
      class: { schoolYear: { isCurrent: true } },
      since: { lte: today },
      OR: [{ until: { isNull: true } }, { until: { gt: today } }],
    },
  });
  return [...new Set(rows.map((row) => row.classId))];
}

export async function listModulesForStudent(
  db: Database,
  studentId: string,
  today: string,
) {
  const classIds = await currentClassIds(db, studentId, today);
  if (classIds.length === 0) return [];
  const modules = await db.query.learningModules.findMany({
    where: { classId: { in: classIds }, status: "published" },
    with: { ...moduleWith, lessons: { columns: { id: true } } },
    orderBy: { publishedAt: "desc", id: "asc" },
  });
  const lessonIds = modules.flatMap((row) => row.lessons.map((l) => l.id));
  const done = lessonIds.length
    ? await db
        .select({ lessonId: lessonProgress.lessonId })
        .from(lessonProgress)
        .where(
          and(
            eq(lessonProgress.studentId, studentId),
            inArray(lessonProgress.lessonId, lessonIds),
            sql`${lessonProgress.completedAt} is not null`,
          ),
        )
    : [];
  const completed = new Set(done.map((row) => row.lessonId));
  return modules.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    publishedAt: row.publishedAt,
    class: row.class,
    subject: row.subject,
    author: row.author,
    lessonsTotal: row.lessons.length,
    lessonsCompleted: row.lessons.filter((lesson) => completed.has(lesson.id))
      .length,
  }));
}

async function publishedModuleFor(
  db: Database,
  moduleId: string,
  studentId: string,
  today: string,
) {
  const row = await db.query.learningModules.findFirst({
    where: { id: moduleId, status: "published" },
    with: {
      ...moduleWith,
      lessons: {
        columns: { id: true, title: true, position: true, document: true },
        orderBy: { position: "asc", createdAt: "asc" },
      },
    },
  });
  if (!row) return undefined;
  const classIds = await currentClassIds(db, studentId, today);
  if (!classIds.includes(row.classId)) return undefined;
  return row;
}

export async function moduleForStudent(
  db: Database,
  moduleId: string,
  studentId: string,
  today: string,
) {
  const row = await publishedModuleFor(db, moduleId, studentId, today);
  if (!row) return undefined;
  const progress = await db.query.lessonProgress.findMany({
    where: { studentId, lessonId: { in: row.lessons.map((l) => l.id) } },
  });
  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    publishedAt: row.publishedAt,
    class: row.class,
    subject: row.subject,
    author: row.author,
    lessons: row.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      position: lesson.position,
      completedAt: byLesson.get(lesson.id)?.completedAt ?? null,
      ...lessonSummary(lesson.document, byLesson.get(lesson.id)?.answers ?? {}),
    })),
  };
}

export type LearnerBlock =
  | Exclude<LessonBlock, { type: "quiz" }>
  | {
      id: string;
      type: "quiz";
      question: string;
      options: { id: string; text: string }[];
      /** Empty until the learner has answered; the answer key never leaves early. */
      correctOptionIds: string[];
      explanation: string;
    };

function learnerView(
  document: LessonDocument,
  answers: LessonAnswers,
): LearnerBlock[] {
  return document.blocks.map((block) =>
    block.type === "quiz" && !(block.id in answers)
      ? { ...block, correctOptionIds: [], explanation: "" }
      : block,
  );
}

export async function lessonForStudent(
  db: Database,
  lessonId: string,
  studentId: string,
  today: string,
) {
  const lesson = await db.query.lessons.findFirst({ where: { id: lessonId } });
  if (!lesson) return undefined;
  const module = await publishedModuleFor(
    db,
    lesson.moduleId,
    studentId,
    today,
  );
  if (!module) return undefined;
  const progress = await db.query.lessonProgress.findFirst({
    where: { lessonId, studentId },
  });
  const answers = progress?.answers ?? {};
  const index = module.lessons.findIndex((item) => item.id === lessonId);
  return {
    id: lesson.id,
    title: lesson.title,
    position: lesson.position,
    module: {
      id: module.id,
      title: module.title,
      lessons: module.lessons.length,
    },
    blocks: learnerView(lesson.document, answers),
    answers,
    completedAt: progress?.completedAt ?? null,
    canComplete: lessonCanComplete(lesson.document, answers),
    previous: index > 0 ? (module.lessons[index - 1]?.id ?? null) : null,
    next: module.lessons[index + 1]?.id ?? null,
  };
}

export async function answerQuiz(
  db: Database,
  input: AnswerQuizInput,
  studentId: string,
  today: string,
  now: Date,
) {
  const lesson = await db.query.lessons.findFirst({
    where: { id: input.lessonId },
  });
  if (!lesson) throw new ManagementError("NOT_FOUND", "learning.not_found");
  const module = await publishedModuleFor(
    db,
    lesson.moduleId,
    studentId,
    today,
  );
  if (!module) throw new ManagementError("NOT_FOUND", "learning.not_found");
  const block = lesson.document.blocks.find(
    (item) => item.id === input.blockId,
  );
  if (!block || block.type !== "quiz")
    throw new ManagementError("BAD_REQUEST", "learning.not_a_quiz");
  const correct = quizIsCorrect(block, input.optionIds);
  const answer = {
    optionIds: input.optionIds,
    correct,
    answeredAt: now.toISOString(),
  };
  const [saved] = await db
    .insert(lessonProgress)
    .values({ lessonId: lesson.id, studentId, answers: { [block.id]: answer } })
    .onConflictDoUpdate({
      target: [lessonProgress.lessonId, lessonProgress.studentId],
      set: {
        answers: sql`${lessonProgress.answers} || ${JSON.stringify({ [block.id]: answer })}::jsonb`,
        updatedAt: now,
      },
    })
    .returning({ answers: lessonProgress.answers });
  return {
    correct,
    correctOptionIds: block.correctOptionIds,
    explanation: block.explanation,
    answers: saved?.answers ?? { [block.id]: answer },
    canComplete: lessonCanComplete(lesson.document, saved?.answers ?? {}),
  };
}

export async function completeLesson(
  db: Database,
  lessonId: string,
  studentId: string,
  today: string,
  now: Date,
) {
  const lesson = await db.query.lessons.findFirst({ where: { id: lessonId } });
  if (!lesson) throw new ManagementError("NOT_FOUND", "learning.not_found");
  const module = await publishedModuleFor(
    db,
    lesson.moduleId,
    studentId,
    today,
  );
  if (!module) throw new ManagementError("NOT_FOUND", "learning.not_found");
  const progress = await db.query.lessonProgress.findFirst({
    where: { lessonId, studentId },
  });
  if (!lessonCanComplete(lesson.document, progress?.answers ?? {}))
    throw new ManagementError("BAD_REQUEST", "learning.quizzes_pending");
  const [saved] = await db
    .insert(lessonProgress)
    .values({ lessonId, studentId, answers: {}, completedAt: now })
    .onConflictDoUpdate({
      target: [lessonProgress.lessonId, lessonProgress.studentId],
      set: {
        completedAt: sql`coalesce(${lessonProgress.completedAt}, ${now.toISOString()}::timestamptz)`,
        updatedAt: now,
      },
    })
    .returning({ completedAt: lessonProgress.completedAt });
  return { completedAt: saved?.completedAt ?? now };
}
