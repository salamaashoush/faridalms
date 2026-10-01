import * as v from "valibot";

/**
 * The exam boards whose sessions the platform keeps: their coursework rules
 * ask for declarations, acknowledged AI use with evidence, and the work kept
 * until results enquiries and appeals close. JCQ covers the UK boards (AQA,
 * OCR, WJEC) under one set of rules.
 */
export const EXAM_BOARDS = ["cambridge", "pearson", "ib", "jcq"] as const;
export type ExamBoard = (typeof EXAM_BOARDS)[number];

export interface ExamSeries {
  id: string;
  board: ExamBoard;
  /** The first day of the month the session sits in. */
  sitsIn: string;
  keepUntil: string;
  retired: boolean;
}

const isoDate = v.pipe(v.string(), v.isoDate());

export function seriesId(board: ExamBoard, sitsIn: string): string {
  return `${board}-${sitsIn.slice(0, 7)}`;
}

/** An official session as the operator console saves it, with its reason. */
export const saveSeriesSchema = v.pipe(
  v.object({
    board: v.picklist(EXAM_BOARDS),
    sitsIn: v.pipe(
      isoDate,
      v.check((value) => value.endsWith("-01"), "exam.sits_in_month"),
    ),
    keepUntil: isoDate,
    retired: v.boolean(),
    reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  }),
  v.check((input) => input.keepUntil > input.sitsIn, "exam.keep_until_early"),
);
