import type { ExamSessionRow } from "@faridalms/database/stores/exams";
import type { ExamBoard, ExamSeries } from "@faridalms/domain/exams";

import {
  examBoardsOf,
  examChanges,
  examSessionById,
  examSessionsOf,
  insertExamSession,
  retireExamSession,
  saveExamBoard,
  updateExamSession,
} from "@faridalms/database/stores/exams";
import {
  addOfficialSessionSchema,
  examHistorySchema,
  retireSessionSchema,
  saveBoardSchema,
  saveSessionSchema,
} from "@faridalms/domain/exams";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

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
