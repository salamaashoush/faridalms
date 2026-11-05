import type { ExamSessionRow } from "@faridalms/database/stores/exams";
import type { ExamBoard, ExamSeries } from "@faridalms/domain/exams";

import { examSessionsOf } from "@faridalms/database/stores/exams";

import type { UnitContext } from "../core/context";

export interface ExamSessionView {
  id: string;
  version: number;
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

export function viewOf(
  row: ExamSessionRow,
  official: Map<string, ExamSeries>,
): ExamSessionView {
  const series = row.officialSeries ? official.get(row.officialSeries) : null;
  const keepUntil = row.keepUntil ?? series?.keepUntil;
  if (!keepUntil) throw new Error(`session ${row.id} has no keep-until date`);
  return {
    id: row.id,
    version: row.version,
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

export async function officialSeries(context: UnitContext) {
  return new Map(
    (await context.directory.examSeries()).map((series) => [series.id, series]),
  );
}

/** The school's exam sessions, and any others named, as their readers see them. */
export async function sessionViews(
  context: UnitContext,
  alsoIds: string[] = [],
) {
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
