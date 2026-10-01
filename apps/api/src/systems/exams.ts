import type { ExamSessionRow } from "@faridalms/database/stores/exams";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ExamBoard, ExamSeries } from "@faridalms/domain/exams";

import {
  assignmentById,
  attemptById,
  studentWork,
} from "@faridalms/database/stores/coursework";
import { documentOf } from "@faridalms/database/stores/documents";
import {
  authenticationsOf,
  courseworkOf,
  courseworkSummaries,
  declarationAttempt,
  declarationsOf,
  examBoardsOf,
  examChanges,
  examSessionById,
  examSessionsOf,
  insertDeclaration,
  insertExamSession,
  retireExamSession,
  saveAuthentication,
  saveExamBoard,
  setCoursework as setCoursework_,
  updateExamSession,
} from "@faridalms/database/stores/exams";
import { adoptFiles, filesOfHosts } from "@faridalms/database/stores/files";
import {
  addOfficialSessionSchema,
  assignmentRefSchema,
  authenticateSchema,
  DECLARATION_STATEMENT,
  declareSchema,
  examHistorySchema,
  paperDeclarationSchema,
  retireSessionSchema,
  saveBoardSchema,
  saveSessionSchema,
  setCourseworkSchema,
} from "@faridalms/domain/exams";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { assessedRules, declarationProblem } from "../core/assessed";
import { learnerAssignment, taughtAssignment } from "../core/coursework-access";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { hostAccess, registerHostReader } from "../files/authorize";

const HISTORY_PAGE = 25;

export interface ExamSessionView {
  id: string;
  official: { series: string; board: ExamBoard } | null;
  boardId: string | null;
  titleEn: string | null;
  titleAr: string | null;
  sitsIn: string;
  /** The date work is kept until: the school's own, else the board's. */
  keepUntil: string;
  /** The school's own date, when it set one. */
  ownKeepUntil: string | null;
  /** The board's official date, for an official session. */
  boardKeepUntil: string | null;
  declarationRequired: boolean;
  aiEvidenceRequired: boolean;
}

function viewOf(
  row: ExamSessionRow,
  official: Map<string, ExamSeries>,
): ExamSessionView {
  const series = row.officialSeries ? official.get(row.officialSeries) : null;
  const keepUntil = row.keepUntil ?? series?.keepUntil;
  if (!keepUntil) throw new Error(`session ${row.id} has no keep-until date`);
  return {
    id: row.id,
    official: series ? { series: series.id, board: series.board } : null,
    boardId: row.boardId,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    sitsIn: row.sitsIn,
    keepUntil,
    ownKeepUntil: row.keepUntil,
    boardKeepUntil: series?.keepUntil ?? null,
    declarationRequired: row.declarationRequired,
    aiEvidenceRequired: row.aiEvidenceRequired,
  };
}

async function officialSeries(context: UnitContext) {
  return new Map(
    (await context.directory.examSeries()).map((series) => [series.id, series]),
  );
}

function refuse(message: string): never {
  throw new ORPCError("BAD_REQUEST", { message });
}

/**
 * The school's exam sessions, for those who set coursework for them and
 * the exams officers who keep them; officers also see the boards and the
 * official sessions not yet added.
 */
export const overview = readProcedure.handler(async ({ context }) => {
  const manages = can(context, "exams:manage");
  if (!manages) requireCapability(context, "assignments:author");
  const scope = { tenantId: context.tenantId, orgId: context.schoolId };
  const [official, rows, boards] = await Promise.all([
    officialSeries(context),
    examSessionsOf(context.tx, scope),
    examBoardsOf(context.tx, scope),
  ]);
  const sessions = rows.map((row) => viewOf(row, official));
  const added = new Set(rows.map((row) => row.officialSeries));
  const today = new Date().toISOString().slice(0, 10);
  return {
    sessions,
    boards,
    available: manages
      ? [...official.values()].filter(
          (series) =>
            !series.retired &&
            !added.has(series.id) &&
            series.keepUntil >= today,
        )
      : [],
  };
});

export const saveBoard = writeProcedure
  .input(saveBoardSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    const saved = await saveExamBoard(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: input.id,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
    });
    if (!saved) throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: input.id ? "exam_board.update" : "exam_board.create",
      objectType: "exam_board",
      objectId: saved.id,
      details: { after: { titleEn: input.titleEn, titleAr: input.titleAr } },
    });
    return saved;
  });

/** Adds one of the boards' official sessions, following the board's date. */
export const addOfficial = writeProcedure
  .input(addOfficialSessionSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    const official = await officialSeries(context);
    const series = official.get(input.series);
    if (!series || series.retired) refuse("exam.series_unknown");
    const row = await insertExamSession(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      officialSeries: series.id,
      boardId: null,
      titleEn: null,
      titleAr: null,
      sitsIn: series.sitsIn,
      keepUntil: null,
      declarationRequired: true,
      aiEvidenceRequired: true,
    });
    await audit(context, {
      action: "exam_session.create",
      objectType: "exam_session",
      objectId: row.id,
      details: { series: series.id },
    });
    return viewOf(row, official);
  });

function rulesOf(row: {
  titleEn: string | null;
  titleAr: string | null;
  sitsIn: string;
  keepUntil: string | null;
  declarationRequired: boolean;
  aiEvidenceRequired: boolean;
}) {
  return {
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    sitsIn: row.sitsIn,
    keepUntil: row.keepUntil,
    declarationRequired: row.declarationRequired,
    aiEvidenceRequired: row.aiEvidenceRequired,
  };
}

/**
 * Adds a session of one of the school's own boards, or changes any session.
 * A change says why, and a date earlier than the board's is kept only when
 * the officer confirms it.
 */
export const saveSession = writeProcedure
  .input(saveSessionSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    const official = await officialSeries(context);
    const scope = { tenantId: context.tenantId, orgId: context.schoolId };
    if (!input.id) {
      const boards = await examBoardsOf(context.tx, scope);
      if (!input.boardId || !boards.some((row) => row.id === input.boardId))
        refuse("exam.board_unknown");
      if (!input.keepUntil) refuse("exam.keep_until_needed");
      if (!input.titleEn && !input.titleAr) refuse("exam.title_needed");
      if (input.keepUntil <= input.sitsIn) refuse("exam.keep_until_early");
      const row = await insertExamSession(context.tx, {
        ...scope,
        officialSeries: null,
        boardId: input.boardId,
        ...rulesOf(input),
      });
      await audit(context, {
        action: "exam_session.create",
        objectType: "exam_session",
        objectId: row.id,
        details: { after: rulesOf(row) },
      });
      return viewOf(row, official);
    }
    if (!input.reason) refuse("exam.reason_needed");
    const before = await examSessionById(context.tx, {
      ...scope,
      id: input.id,
      lock: true,
    });
    if (!before) throw new ORPCError("NOT_FOUND");
    const series = before.officialSeries
      ? official.get(before.officialSeries)
      : undefined;
    // An official session keeps the board's name and month.
    const next = series
      ? {
          ...rulesOf(input),
          titleEn: null,
          titleAr: null,
          sitsIn: before.sitsIn,
        }
      : rulesOf(input);
    if (!series && !next.keepUntil) refuse("exam.keep_until_needed");
    if (!series && !next.titleEn && !next.titleAr) refuse("exam.title_needed");
    if (next.keepUntil && next.keepUntil <= next.sitsIn)
      refuse("exam.keep_until_early");
    if (
      series &&
      next.keepUntil &&
      next.keepUntil < series.keepUntil &&
      !input.belowBoard
    )
      throw new ORPCError("CONFLICT", {
        message: "exam.below_board",
        data: { boardKeepUntil: series.keepUntil },
      });
    const row = await updateExamSession(context.tx, {
      tenantId: context.tenantId,
      id: before.id,
      ...next,
    });
    await audit(context, {
      action: "exam_session.update",
      objectType: "exam_session",
      objectId: row.id,
      details: {
        reason: input.reason,
        series: before.officialSeries,
        before: rulesOf(before),
        after: rulesOf(row),
        ...(series && next.keepUntil && next.keepUntil < series.keepUntil
          ? { belowBoard: series.keepUntil }
          : {}),
      },
    });
    return viewOf(row, official);
  });

/** Takes a session off the list for new coursework; work set for it stays. */
export const retireSession = writeProcedure
  .input(retireSessionSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    const before = await examSessionById(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: input.id,
      lock: true,
    });
    if (!before) throw new ORPCError("NOT_FOUND");
    await retireExamSession(context.tx, {
      tenantId: context.tenantId,
      id: before.id,
    });
    await audit(context, {
      action: "exam_session.retire",
      objectType: "exam_session",
      objectId: before.id,
      details: {
        reason: input.reason,
        series: before.officialSeries,
        before: rulesOf(before),
      },
    });
    return { ok: true };
  });

export const history = readProcedure
  .input(examHistorySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    return examChanges(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      limit: HISTORY_PAGE,
      offset: (input.page - 1) * HISTORY_PAGE,
    });
  });

async function sessionViews(context: UnitContext, alsoIds: string[] = []) {
  const [official, rows] = await Promise.all([
    officialSeries(context),
    examSessionsOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      alsoIds,
    }),
  ]);
  return rows.map((row) => viewOf(row, official));
}

// Whoever reads the attempt a paper declaration covers reads its scan, and
// so do the school's exams officers.
registerHostReader("attempt_declaration", async (context, id) => {
  const attemptId = await declarationAttempt(context.tx, {
    tenantId: context.tenantId,
    id,
  });
  if (!attemptId) return false;
  if (can(context, "exams:manage")) return true;
  return (
    (await hostAccess(context, {
      type: "submission_attempt",
      id: attemptId,
    })) !== null
  );
});

/** The exam session an assignment is assessed coursework for, for its teachers. */
export const coursework = readProcedure
  .input(assignmentRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const assignment = await taughtAssignment(context, input.assignmentId);
    return courseworkOf(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    });
  });

export const setCoursework = writeProcedure
  .input(setCourseworkSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const assignment = await taughtAssignment(context, input.assignmentId);
    if (input.sessionId) {
      if (assignment.submissionFormat === "quiz")
        refuse("coursework.not_for_quiz");
      const session = await examSessionById(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: input.sessionId,
      });
      if (!session) refuse("exam.session_unknown");
    }
    await setCoursework_(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      sessionId: input.sessionId,
      component: input.sessionId ? input.component : null,
      userId: context.actor.userId,
    });
    await audit(context, {
      action: input.sessionId ? "coursework.assess" : "coursework.unassess",
      objectType: "assignment",
      objectId: assignment.id,
      details: { sessionId: input.sessionId, component: input.component },
    });
    return courseworkOf(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
    });
  });

function rulesView(
  rules: NonNullable<Awaited<ReturnType<typeof assessedRules>>>,
  session: ExamSessionView | undefined,
) {
  return {
    component: rules.coursework.component,
    declarationRequired: rules.declarationRequired,
    aiEvidenceRequired: rules.aiEvidenceRequired,
    session: session ?? null,
  };
}

/**
 * Where each student's latest attempt stands: declared or not, and the
 * teacher's word on it. Teachers grade from this; exams officers follow it.
 */
async function standing(context: UnitContext, assignmentId: string) {
  const rules = await assessedRules(context, assignmentId);
  if (!rules) return null;
  const [work, sessions] = await Promise.all([
    studentWork(context.tx, { tenantId: context.tenantId, assignmentId }),
    sessionViews(context, [rules.coursework.sessionId]),
  ]);
  const attemptIds = work.flatMap((row) =>
    row.attemptId ? [row.attemptId] : [],
  );
  const scope = { tenantId: context.tenantId, attemptIds };
  const [declarations, authentications] = await Promise.all([
    declarationsOf(context.tx, scope),
    authenticationsOf(context.tx, scope),
  ]);
  const scans = await filesOfHosts(context.tx, context.tenantId, {
    type: "attempt_declaration",
    ids: declarations.map((row) => row.id),
  });
  return {
    ...rulesView(
      rules,
      sessions.find((row) => row.id === rules.coursework.sessionId),
    ),
    students: work.map((row) => {
      const declaration = declarations.find(
        (item) => item.attemptId === row.attemptId,
      );
      const authentication = authentications.find(
        (item) => item.attemptId === row.attemptId,
      );
      const scan = declaration
        ? scans.find((file) => file.hostId === declaration.id)
        : undefined;
      return {
        studentId: row.studentId,
        fullNameEn: row.fullNameEn,
        fullNameAr: row.fullNameAr,
        attemptId: row.attemptId,
        submittedAt: row.submittedAt,
        released: row.released,
        declaration: declaration
          ? {
              kind: declaration.kind,
              aiUsed: declaration.aiUsed,
              declaredAt: declaration.declaredAt,
              scan: scan ? { id: scan.id, name: scan.name } : null,
            }
          : null,
        authentication: authentication
          ? {
              outcome: authentication.outcome,
              note: authentication.note,
              teacherEn: authentication.teacherNameEn,
              teacherAr: authentication.teacherNameAr,
              at: authentication.at,
            }
          : null,
      };
    }),
  };
}

/** Each student's declaration and authentication, for the teacher grading. */
export const workStanding = readProcedure
  .input(assignmentRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const assignment = await taughtAssignment(context, input.assignmentId);
    return standing(context, assignment.id);
  });

/** What handing in asks of the student, and which attempts await their declaration. */
export const myStanding = readProcedure
  .input(assignmentRefSchema)
  .handler(async ({ input, context }) => {
    const { assignment } = await learnerAssignment(context, input.assignmentId);
    const rules = await assessedRules(context, assignment.id);
    if (!rules) return null;
    const [row] = await studentWork(context.tx, {
      tenantId: context.tenantId,
      assignmentId: assignment.id,
      studentId: context.actor.userId,
    });
    const sessions = await sessionViews(context, [rules.coursework.sessionId]);
    const declared = row?.attemptId
      ? await declarationsOf(context.tx, {
          tenantId: context.tenantId,
          attemptIds: [row.attemptId],
        })
      : [];
    return {
      ...rulesView(
        rules,
        sessions.find((item) => item.id === rules.coursework.sessionId),
      ),
      latestAttemptId: row?.attemptId ?? null,
      latestDeclared: declared.length > 0,
    };
  });

/** An attempt of an assessed assignment whose declaration is still outstanding. */
async function undeclared(context: UnitContext, attemptId: string) {
  const attempt = await attemptById(context.tx, context.tenantId, attemptId);
  if (!attempt) throw new ORPCError("NOT_FOUND");
  const rules = await assessedRules(context, attempt.assignmentId);
  if (!rules?.declarationRequired) refuse("coursework.no_declaration");
  const existing = await declarationsOf(context.tx, {
    tenantId: context.tenantId,
    attemptIds: [attemptId],
  });
  if (existing.length) refuse("coursework.declared_already");
  return { attempt, rules };
}

/** A student declares an attempt their teacher handed in for them. */
export const declare = writeProcedure
  .input(declareSchema)
  .handler(async ({ input, context }) => {
    const { attempt, rules } = await undeclared(context, input.attemptId);
    if (attempt.studentId !== context.actor.userId)
      throw new ORPCError("NOT_FOUND");
    await learnerAssignment(context, attempt.assignmentId);
    const frozen = await documentOf(context.tx, context.tenantId, {
      type: "submission_attempt",
      id: input.attemptId,
    });
    const problem = declarationProblem(
      (frozen?.content as unknown as ContentDocument | undefined) ?? null,
      input.aiUsed,
      rules.aiEvidenceRequired,
    );
    if (problem) refuse(problem);
    await insertDeclaration(context.tx, {
      tenantId: context.tenantId,
      attemptId: input.attemptId,
      studentId: context.actor.userId,
      kind: "student",
      statement: DECLARATION_STATEMENT,
      aiUsed: input.aiUsed,
      userId: context.actor.userId,
    });
    await audit(context, {
      action: "coursework.declare",
      objectType: "submission_attempt",
      objectId: input.attemptId,
      studentUserId: context.actor.userId,
      details: { aiUsed: input.aiUsed },
    });
    return { ok: true };
  });

/** A teacher records a declaration the student signed on paper, with its scan if kept. */
export const recordPaperDeclaration = writeProcedure
  .input(paperDeclarationSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const { attempt } = await undeclared(context, input.attemptId);
    await taughtAssignment(context, attempt.assignmentId);
    const declaration = await insertDeclaration(context.tx, {
      tenantId: context.tenantId,
      attemptId: input.attemptId,
      studentId: attempt.studentId,
      kind: "paper",
      statement: DECLARATION_STATEMENT,
      aiUsed: null,
      userId: context.actor.userId,
    });
    if (input.scanFileId) {
      const adopted = await adoptFiles(context.tx, {
        tenantId: context.tenantId,
        userId: context.actor.userId,
        host: { type: "attempt_declaration", id: declaration.id },
        ids: [input.scanFileId],
      });
      if (!adopted.length)
        throw new ORPCError("FORBIDDEN", { message: "file.not_attachable" });
    }
    await audit(context, {
      action: "coursework.declare_paper",
      objectType: "submission_attempt",
      objectId: input.attemptId,
      studentUserId: attempt.studentId,
      details: { scan: Boolean(input.scanFileId) },
    });
    return { ok: true };
  });

/**
 * The teacher's word that the work is the student's own, or that they cannot
 * give it and why. It needs the student's declaration first where the
 * session asks for one; confirmed work is final.
 */
export const authenticate = writeProcedure
  .input(authenticateSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const attempt = await attemptById(
      context.tx,
      context.tenantId,
      input.attemptId,
    );
    if (!attempt) throw new ORPCError("NOT_FOUND");
    await taughtAssignment(context, attempt.assignmentId);
    const rules = await assessedRules(context, attempt.assignmentId);
    if (!rules) refuse("coursework.not_assessed");
    const scope = {
      tenantId: context.tenantId,
      attemptIds: [input.attemptId],
    };
    if (
      rules.declarationRequired &&
      !(await declarationsOf(context.tx, scope)).length
    )
      refuse("coursework.declaration_outstanding");
    const [before] = await authenticationsOf(context.tx, scope);
    if (before?.outcome === "confirmed")
      throw new ORPCError("CONFLICT", { message: "coursework.final" });
    await saveAuthentication(context.tx, {
      tenantId: context.tenantId,
      attemptId: input.attemptId,
      outcome: input.outcome,
      note: input.note,
      userId: context.actor.userId,
    });
    await audit(context, {
      action: `coursework.${input.outcome}`,
      objectType: "submission_attempt",
      objectId: input.attemptId,
      studentUserId: attempt.studentId,
      details: { note: input.note, before: before?.outcome ?? null },
    });
    return { ok: true };
  });

/** All assessed coursework in the school, for its exams officers. */
export const courseworkList = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "exams:manage");
  const rows = await courseworkSummaries(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
  });
  const sessions = await sessionViews(
    context,
    rows.map((row) => row.sessionId),
  );
  return rows.map((row) => ({
    ...row,
    session: sessions.find((session) => session.id === row.sessionId) ?? null,
  }));
});

/** One piece of assessed coursework, student by student, for its exams officers. */
export const courseworkStudents = readProcedure
  .input(assignmentRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    const assignment = await assignmentById(
      context.tx,
      context.tenantId,
      input.assignmentId,
    );
    if (!assignment || assignment.orgId !== context.schoolId)
      throw new ORPCError("NOT_FOUND");
    const found = await standing(context, assignment.id);
    if (!found) throw new ORPCError("NOT_FOUND");
    return { title: assignment.title, ...found };
  });
