import type { CellTransaction } from "@faridalms/database/context";
import type { DirectorySchool } from "@faridalms/database/directory/client";
import type { QuestionKind } from "@faridalms/domain/content";
import type { PlatformDomains } from "@faridalms/domain/hosts";
import type { XapiResult, XapiStatement } from "@faridalms/domain/xapi";

import { namesOf } from "@faridalms/database/stores/coursework";
import {
  lessonById,
  moduleById,
  progressIn,
} from "@faridalms/database/stores/learning";
import {
  queueStatements,
  sendsStatements,
} from "@faridalms/database/stores/xapi";
import { availableModules } from "@faridalms/domain/plans";
import {
  answerResult,
  lessonResult,
  markResult,
  xapiActivity,
  xapiStatement,
} from "@faridalms/domain/xapi";

import { portalOrigin } from "../core/portal";
import { activityIds, learnerOf, statementId } from "./statements";

/** Where learning happens, as much as sending it needs. */
export interface LearningScope {
  tx: CellTransaction;
  tenantId: string;
  school: DirectorySchool;
  domains: PlatformDomains;
}

/**
 * Whether a school sends its learning to its own record store now: it has
 * the integrations module and has turned sending on.
 */
async function sends(scope: LearningScope) {
  return (
    availableModules(scope.school.entitlements).includes("integrations") &&
    (await sendsStatements(scope.tx, {
      tenantId: scope.tenantId,
      orgId: scope.school.schoolId,
    }))
  );
}

/**
 * Queues statements for the school's record store in the request's own
 * transaction, so they go only if what they say happened is kept; the
 * sender takes them from there, so the request never waits on the store.
 */
async function queue(
  scope: LearningScope,
  made: (
    home: string,
  ) => Promise<{ studentUserId: string; statement: XapiStatement }[]>,
) {
  if (!(await sends(scope))) return;
  const statements = await made(portalOrigin(scope.school, scope.domains));
  await queueStatements(scope.tx, {
    tenantId: scope.tenantId,
    orgId: scope.school.schoolId,
    statements: statements.map((row) => ({
      statementId: row.statement.id,
      studentUserId: row.studentUserId,
      statement: row.statement as unknown as Record<string, unknown>,
    })),
  });
}

/** Queues statements made elsewhere, such as a package's own, as they are. */
export async function sendStatements(
  scope: LearningScope,
  statements: { studentUserId: string; statement: XapiStatement }[],
) {
  await queue(scope, async () => statements);
}

const nameOf = async (scope: LearningScope, studentId: string) => {
  const [person] = await namesOf(scope.tx, scope.tenantId, [studentId]);
  return person ? (person.fullNameEn ?? person.fullNameAr) : null;
};

/** The lesson and its module as statements name them. */
async function lessonActivities(
  scope: LearningScope,
  home: string,
  lessonId: string,
) {
  const lesson = await lessonById(scope.tx, scope.tenantId, lessonId);
  if (!lesson) return null;
  const module = await moduleById(scope.tx, scope.tenantId, lesson.moduleId);
  return {
    lesson,
    activity: xapiActivity(
      "lesson",
      activityIds.lesson(home, lesson.id),
      lesson.title,
      lesson.language,
    ),
    parent: module
      ? [
          xapiActivity(
            "module",
            activityIds.module(home, module.id),
            module.title,
            null,
          ),
        ]
      : [],
  };
}

/**
 * Tells the school's record store a student finished a lesson, when this
 * is the moment they did: with the lesson's score, whether it passed and
 * how long it took, as the module's export says it.
 */
export async function lessonFinished(
  scope: LearningScope,
  input: { lessonId: string; studentId: string; wasFinished: boolean },
) {
  if (input.wasFinished) return;
  await queue(scope, async (home) => {
    const [progress] = await progressIn(scope.tx, {
      tenantId: scope.tenantId,
      lessonIds: [input.lessonId],
      studentIds: [input.studentId],
    });
    const found = await lessonActivities(scope, home, input.lessonId);
    if (!progress?.completedAt || !found) return [];
    return [
      {
        studentUserId: input.studentId,
        statement: xapiStatement({
          id: statementId(
            `live:progress:${input.lessonId}:${input.studentId}:${progress.attempts}:${progress.completedAt}`,
          ),
          actor: learnerOf(
            home,
            input.studentId,
            await nameOf(scope, input.studentId),
          ),
          verb: "completed",
          object: found.activity,
          result: lessonResult({
            ...progress,
            passScore: found.lesson.passScore,
          }),
          language: found.lesson.language,
          parent: found.parent,
          timestamp: progress.completedAt,
        }),
      },
    ];
  });
}

/**
 * Tells the school's record store a student answered a question that
 * marks itself, by the answer's own id, as the module's export names it,
 * so a store given both keeps one.
 */
export async function questionAnswered(
  scope: LearningScope,
  input: {
    answerId: string;
    lessonId: string;
    studentId: string;
    question: {
      id: string;
      prompt: string;
      kind: QuestionKind;
      points: number | null;
    };
    fraction: number;
    answeredAt: Date;
  },
) {
  await queue(scope, async (home) => {
    const found = await lessonActivities(scope, home, input.lessonId);
    if (!found) return [];
    return [
      {
        studentUserId: input.studentId,
        statement: xapiStatement({
          id: input.answerId,
          actor: learnerOf(
            home,
            input.studentId,
            await nameOf(scope, input.studentId),
          ),
          verb: "answered",
          object: xapiActivity(
            "question",
            `${activityIds.lesson(home, input.lessonId)}#${input.question.id}`,
            input.question.prompt || found.lesson.title,
            found.lesson.language,
            input.question.kind,
          ),
          result: answerResult(input.fraction, input.question.points),
          language: found.lesson.language,
          parent: [found.activity],
          grouping: found.parent,
          timestamp: input.answeredAt.toISOString(),
        }),
      },
    ];
  });
}

/** A mark a student was given, as one statement: scored, in its class. */
function scored(
  home: string,
  input: {
    id: string;
    studentId: string;
    name: string | null;
    object: ReturnType<typeof xapiActivity>;
    grouping: ReturnType<typeof xapiActivity>[];
    result: XapiResult;
    at: Date;
  },
) {
  return {
    studentUserId: input.studentId,
    statement: xapiStatement({
      id: input.id,
      actor: learnerOf(home, input.studentId, input.name),
      verb: "scored",
      object: input.object,
      result: input.result,
      language: null,
      grouping: input.grouping,
      timestamp: input.at.toISOString(),
    }),
  };
}

/**
 * Tells the school's record store the marks a teacher released on an
 * assignment, each as it now stands; a mark released again after a change
 * is another statement.
 */
export async function marksReleased(
  scope: LearningScope,
  input: {
    assignment: { id: string; title: string; points: number | null };
    course: { id: string; title: string };
    marks: {
      attemptId: string;
      studentId: string;
      score: number;
      releasedAt: Date;
    }[];
  },
) {
  const points = input.assignment.points;
  if (points === null || points <= 0 || input.marks.length === 0) return;
  await queue(scope, async (home) => {
    const object = xapiActivity(
      "assessment",
      activityIds.assignment(home, input.assignment.id),
      input.assignment.title,
      null,
    );
    const course = xapiActivity(
      "course",
      activityIds.course(home, input.course.id),
      input.course.title,
      null,
    );
    const names = new Map(
      (
        await namesOf(
          scope.tx,
          scope.tenantId,
          input.marks.map((mark) => mark.studentId),
        )
      ).map((row) => [row.id, row.fullNameEn ?? row.fullNameAr]),
    );
    return input.marks.map((mark) =>
      scored(home, {
        id: statementId(
          `live:mark:${mark.attemptId}:${mark.score}:${mark.releasedAt.toISOString()}`,
        ),
        studentId: mark.studentId,
        name: names.get(mark.studentId) ?? null,
        object,
        grouping: [course],
        result: markResult(mark.score, points),
        at: mark.releasedAt,
      }),
    );
  });
}

/**
 * Tells the school's record store a score an outside tool sent, out of the
 * tool's own maximum, in the course the tool's column sits in.
 */
export async function toolScored(scope: LearningScope, input: ToolScore) {
  await queue(scope, async (home) => [
    toolScoreStatement(home, {
      ...input,
      name: await nameOf(scope, input.studentId),
    }),
  ]);
}

/** A score an outside tool sent, out of its own maximum. */
interface ToolScore {
  column: { id: string; label: string };
  toolName: string;
  course: { kind: "module" | "class"; id: string; title: string };
  studentId: string;
  scoreGiven: number;
  scoreMaximum: number;
  scoredAt: Date;
}

/**
 * A tool's score as a statement, the same as it happens and in a module's
 * export, by an id the score always gives, so a store given both keeps one.
 */
export function toolScoreStatement(
  home: string,
  input: ToolScore & { name: string | null },
) {
  return scored(home, {
    id: statementId(
      `live:tool:${input.column.id}:${input.studentId}:${input.scoredAt.toISOString()}`,
    ),
    studentId: input.studentId,
    name: input.name,
    object: xapiActivity(
      "assessment",
      activityIds.toolColumn(home, input.column.id),
      `${input.column.label} (${input.toolName})`,
      null,
    ),
    grouping: [
      input.course.kind === "module"
        ? xapiActivity(
            "module",
            activityIds.module(home, input.course.id),
            input.course.title,
            null,
          )
        : xapiActivity(
            "course",
            activityIds.course(home, input.course.id),
            input.course.title,
            null,
          ),
    ],
    result: markResult(input.scoreGiven, input.scoreMaximum),
    at: input.scoredAt,
  });
}
