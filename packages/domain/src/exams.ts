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

const title = v.nullable(
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
);
const reason = v.pipe(v.string(), v.trim(), v.maxLength(500));
const month = v.pipe(
  isoDate,
  v.check((value) => value.endsWith("-01"), "exam.sits_in_month"),
);

/** A board of the school's own. */
export const saveBoardSchema = v.pipe(
  v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    titleEn: title,
    titleAr: title,
  }),
  v.check(
    (input) => Boolean(input.titleEn ?? input.titleAr),
    "exam.title_needed",
  ),
);

export const addOfficialSessionSchema = v.object({
  series: v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]{2,62}$/)),
});

/**
 * A school's session as its exams officer sets it. Changing one needs a
 * reason; keeping work for less time than the board asks needs saying so.
 */
export const saveSessionSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  boardId: v.optional(v.pipe(v.string(), v.uuid())),
  titleEn: title,
  titleAr: title,
  sitsIn: month,
  /** Null for an official session that follows the board's date. */
  keepUntil: v.nullable(isoDate),
  declarationRequired: v.boolean(),
  aiEvidenceRequired: v.boolean(),
  reason,
  belowBoard: v.optional(v.boolean(), false),
});

export const retireSessionSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  reason: v.pipe(reason, v.minLength(1)),
});

export const examHistorySchema = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});

/** A session's settings as its history records them. */
export interface ExamSessionRules {
  titleEn: string | null;
  titleAr: string | null;
  sitsIn: string;
  keepUntil: string | null;
  declarationRequired: boolean;
  aiEvidenceRequired: boolean;
}

/** What a change to a school's sessions or boards keeps beside it. */
export interface ExamChangeDetails {
  reason?: string;
  series?: string | null;
  belowBoard?: string;
  before?: ExamSessionRules;
  after?: ExamSessionRules | { titleEn: string | null; titleAr: string | null };
}

/**
 * The wording students agree to, named so a later rewording leaves earlier
 * declarations recording what was agreed. It covers what JCQ, Cambridge and
 * the IB ask a candidate to confirm: own work, sources and AI use
 * acknowledged, no help beyond what was allowed, and what follows if not.
 */
export const DECLARATION_STATEMENT = "2026-10";

const uuid = v.pipe(v.string(), v.uuid());

export const setCourseworkSchema = v.object({
  assignmentId: uuid,
  /** Null takes the assignment off assessed coursework. */
  sessionId: v.nullable(uuid),
  component: v.nullable(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  ),
});

/** What a student agrees to at hand-in, and whether they used an AI tool. */
export const declarationSchema = v.object({
  agreed: v.literal(true),
  aiUsed: v.boolean(),
});

export const declareSchema = v.object({
  attemptId: uuid,
  ...declarationSchema.entries,
});

export const paperDeclarationSchema = v.object({
  attemptId: uuid,
  scanFileId: v.optional(uuid),
});

export const authenticateSchema = v.pipe(
  v.object({
    attemptId: uuid,
    outcome: v.picklist(["confirmed", "not_confirmed"]),
    note: v.nullable(
      v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
    ),
  }),
  v.check(
    (input) => input.outcome === "confirmed" || input.note !== null,
    "coursework.reason_needed",
  ),
);

export const assignmentRefSchema = v.object({ assignmentId: uuid });
