import * as v from "valibot";

import { pageField } from "./paging";

/** A grade a scale gives from a percentage up, and its GPA points if any. */
export interface GradeBand {
  labelEn: string;
  labelAr: string;
  minPercent: number;
  gpa: number | null;
}

/** What a student and family see beside a grade: the grade, or the score too. */
export const GRADE_DISPLAYS = ["grade", "grade_score"] as const;
export type GradeDisplay = (typeof GRADE_DISPLAYS)[number];

export interface ScalePreset {
  key: string;
  titleEn: string;
  titleAr: string;
  display: GradeDisplay;
  bands: GradeBand[];
}

const same = (
  label: string,
  minPercent: number,
  gpa: number | null = null,
) => ({
  labelEn: label,
  labelAr: label,
  minPercent,
  gpa,
});

/**
 * Starting points a school adjusts. Boards set real boundaries per paper
 * and session, so these are the conversions schools commonly use for
 * coursework and reports; the MYP's are the IB's own published criterion
 * totals out of 32, and the US plus/minus GPA is the College Board's.
 */
export const SCALE_PRESETS: readonly ScalePreset[] = [
  {
    key: "igcse_a_star_g",
    titleEn: "IGCSE A* to G",
    titleAr: "IGCSE من A* إلى G",
    display: "grade",
    bands: [
      same("A*", 90),
      same("A", 80),
      same("B", 70),
      same("C", 60),
      same("D", 50),
      same("E", 40),
      same("F", 30),
      same("G", 20),
      same("U", 0),
    ],
  },
  {
    key: "igcse_9_1",
    titleEn: "IGCSE 9 to 1",
    titleAr: "IGCSE من 9 إلى 1",
    display: "grade",
    bands: [
      same("9", 90),
      same("8", 80),
      same("7", 70),
      same("6", 60),
      same("5", 50),
      same("4", 40),
      same("3", 30),
      same("2", 20),
      same("1", 10),
      same("U", 0),
    ],
  },
  {
    key: "a_level",
    titleEn: "A Level A* to E",
    titleAr: "A Level من A* إلى E",
    display: "grade",
    bands: [
      same("A*", 90),
      same("A", 80),
      same("B", 70),
      same("C", 60),
      same("D", 50),
      same("E", 40),
      same("U", 0),
    ],
  },
  {
    key: "ib_dp",
    titleEn: "IB Diploma 1 to 7",
    titleAr: "دبلوم البكالوريا الدولية من 1 إلى 7",
    display: "grade",
    bands: [
      same("7", 80),
      same("6", 70),
      same("5", 60),
      same("4", 50),
      same("3", 40),
      same("2", 25),
      same("1", 0),
    ],
  },
  {
    key: "ib_myp",
    titleEn: "IB MYP 1 to 7",
    titleAr: "برنامج السنوات المتوسطة من 1 إلى 7",
    display: "grade",
    bands: [
      same("7", 87.5),
      same("6", 75),
      same("5", 59.375),
      same("4", 46.875),
      same("3", 31.25),
      same("2", 18.75),
      same("1", 0),
    ],
  },
  {
    key: "us_letter",
    titleEn: "Letter grades A to F",
    titleAr: "الدرجات بالحروف من A إلى F",
    display: "grade_score",
    bands: [
      same("A", 90, 4),
      same("B", 80, 3),
      same("C", 70, 2),
      same("D", 60, 1),
      same("F", 0, 0),
    ],
  },
  {
    key: "us_plus_minus",
    titleEn: "Letter grades with plus and minus",
    titleAr: "الدرجات بالحروف مع الزائد والناقص",
    display: "grade_score",
    bands: [
      same("A+", 97, 4),
      same("A", 93, 4),
      same("A-", 90, 3.7),
      same("B+", 87, 3.3),
      same("B", 83, 3),
      same("B-", 80, 2.7),
      same("C+", 77, 2.3),
      same("C", 73, 2),
      same("C-", 70, 1.7),
      same("D+", 67, 1.3),
      same("D", 63, 1),
      same("D-", 60, 0.7),
      same("F", 0, 0),
    ],
  },
  {
    key: "egypt_bands",
    titleEn: "Egyptian percentage bands",
    titleAr: "التقديرات المصرية بالنسبة المئوية",
    display: "grade_score",
    bands: [
      { labelEn: "Excellent", labelAr: "ممتاز", minPercent: 85, gpa: null },
      { labelEn: "Very good", labelAr: "جيد جدًا", minPercent: 75, gpa: null },
      { labelEn: "Good", labelAr: "جيد", minPercent: 65, gpa: null },
      { labelEn: "Pass", labelAr: "مقبول", minPercent: 50, gpa: null },
      { labelEn: "Weak", labelAr: "ضعيف", minPercent: 0, gpa: null },
    ],
  },
];

/** The band a percentage falls in: the highest whose lower bound it reaches. */
export function bandFor(
  bands: readonly GradeBand[],
  percent: number,
): GradeBand | null {
  return (
    bands
      .toSorted((a, b) => b.minPercent - a.minPercent)
      .find((band) => percent >= band.minPercent) ?? null
  );
}

const uuid = v.pipe(v.string(), v.uuid());
const title = v.nullable(
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
);
const label = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(24));
const reason = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500));

export const bandSchema = v.object({
  labelEn: label,
  labelAr: label,
  minPercent: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  gpa: v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(5))),
});

/**
 * A scale's bands: each grade named once, lower bounds all different, and
 * one starting at 0 so every score has a grade.
 */
export const bandsSchema = v.pipe(
  v.array(bandSchema),
  v.minLength(2),
  v.maxLength(20),
  v.check(
    (bands) => new Set(bands.map((band) => band.labelEn)).size === bands.length,
    "grading.label_repeated",
  ),
  v.check(
    (bands) =>
      new Set(bands.map((band) => band.minPercent)).size === bands.length,
    "grading.bound_repeated",
  ),
  v.check(
    (bands) => bands.some((band) => band.minPercent === 0),
    "grading.no_floor",
  ),
);

export const saveScaleSchema = v.pipe(
  v.object({
    id: v.optional(uuid),
    titleEn: title,
    titleAr: title,
    display: v.picklist(GRADE_DISPLAYS),
    /** A new scale starts with these bands, from today. */
    bands: v.optional(bandsSchema),
  }),
  v.check(
    (input) => Boolean(input.titleEn ?? input.titleAr),
    "grading.title_needed",
  ),
);

/** New bands for a scale from a date; grades given earlier keep theirs. */
export const saveBandsSchema = v.object({
  scaleId: uuid,
  effectiveFrom: v.pipe(v.string(), v.isoDate()),
  bands: bandsSchema,
  reason,
});

export const retireScaleSchema = v.object({ id: uuid, reason });

export const categorySchema = v.pipe(
  v.object({
    id: v.optional(uuid),
    titleEn: v.nullable(
      v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
    ),
    titleAr: v.nullable(
      v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
    ),
    weight: v.pipe(v.number(), v.minValue(0.01), v.maxValue(100)),
  }),
  v.check(
    (input) => Boolean(input.titleEn ?? input.titleAr),
    "grading.title_needed",
  ),
);

export const saveProgrammeSchema = v.pipe(
  v.object({
    id: v.optional(uuid),
    titleEn: title,
    titleAr: title,
    scaleId: v.nullable(uuid),
    /** How work weighs in a term grade; none weighs all work by its points. */
    categories: v.optional(
      v.pipe(v.array(categorySchema), v.maxLength(12)),
      [],
    ),
    /** What modules keep about the programme, each read by its own schema. */
    parts: v.optional(v.record(v.string(), v.unknown()), {}),
  }),
  v.check(
    (input) => Boolean(input.titleEn ?? input.titleAr),
    "grading.title_needed",
  ),
  v.check(
    (input) =>
      !input.categories.length ||
      Math.abs(
        input.categories.reduce((sum, row) => sum + row.weight, 0) - 100,
      ) < 0.01,
    "grading.weights_total",
  ),
);

export const retireProgrammeSchema = v.object({ id: uuid });

/** A page of the changes made to the school's grading. */
export const gradingHistorySchema = v.object({ page: pageField });

/** A class's programme and its own scale, each empty to follow the default. */
export const classGradingSchema = v.object({
  classId: uuid,
  programmeId: v.nullable(uuid),
  scaleId: v.nullable(uuid),
});

/** A grade as shown: its name in both languages, GPA points, and how to show it. */
export interface GradeView {
  labelEn: string;
  labelAr: string;
  gpa: number | null;
  display: GradeDisplay;
}

/** The grade a score earns under the bands it was given under, if any. */
export function gradeOf(
  version: { bands: readonly GradeBand[]; display: GradeDisplay } | undefined,
  score: number | null,
  max: number | null,
): GradeView | null {
  if (!version || score === null || !max) return null;
  const band = bandFor(version.bands, (score / max) * 100);
  return band
    ? {
        labelEn: band.labelEn,
        labelAr: band.labelAr,
        gpa: band.gpa,
        display: version.display,
      }
    : null;
}

export interface WorkResult {
  categoryId: string | null;
  points: number | null;
  /** The score that counts, after any late deduction; empty when ungraded. */
  score: number | null;
  excused: boolean;
}

const possibleOf = (rows: readonly WorkResult[]) =>
  rows.reduce((sum, row) => sum + (row.points ?? 0), 0);

/**
 * The share of the grade each piece of work carries, as a fraction, in the
 * order given; null for work that does not count. As Canvas assignment
 * groups and Classroom grade categories work: each category's weight is
 * shared among the categories that have graded work, and within one among
 * its pieces by their points. Without categories, all work counts by its
 * points. Ungraded and excused work is left out rather than counted as
 * zero, and so is work in no category of the class's.
 */
export function workWeights(
  work: readonly WorkResult[],
  categories: readonly { id: string; weight: number }[],
): (number | null)[] {
  const counts = (row: WorkResult) =>
    !row.excused && row.score !== null && Boolean(row.points);
  const graded = work.filter(counts);
  if (!categories.length) {
    const possible = possibleOf(graded);
    return work.map((row) =>
      possible && counts(row) ? (row.points ?? 0) / possible : null,
    );
  }
  const possible = new Map(
    categories.map((category) => [
      category.id,
      possibleOf(graded.filter((row) => row.categoryId === category.id)),
    ]),
  );
  const weights = categories.reduce(
    (sum, category) =>
      (possible.get(category.id) ?? 0) > 0 ? sum + category.weight : sum,
    0,
  );
  return work.map((row) => {
    const category = categories.find((each) => each.id === row.categoryId);
    const inCategory = category ? (possible.get(category.id) ?? 0) : 0;
    if (!category || !weights || !inCategory || !counts(row)) return null;
    return ((category.weight / weights) * (row.points ?? 0)) / inCategory;
  });
}

/** A term's or a run's percentage from its graded work, weighted as `workWeights` shares it. */
export function termPercent(
  work: readonly WorkResult[],
  categories: readonly { id: string; weight: number }[],
): number | null {
  const weights = workWeights(work, categories);
  let percent = 0;
  let counted = false;
  for (const [index, row] of work.entries()) {
    const weight = weights[index];
    if (weight === null || weight === undefined || !row.points) continue;
    percent += weight * ((row.score ?? 0) / row.points) * 100;
    counted = true;
  }
  return counted ? percent : null;
}

/** A student's result on a piece of the class's work, as the gradebook reads it. */
export interface BookResult {
  score: number | null;
  /** The score after any late deduction. */
  effectiveScore: number | null;
  excused: boolean;
  /** Returned to the student, so they can read it. */
  released: boolean;
}

/** A piece of work as it counts toward a student's running grade. */
export interface RunningPart {
  assignmentId: string;
  score: number | null;
  points: number | null;
  excused: boolean;
  /** Its share of the grade as a percentage; null when it does not count. */
  weight: number | null;
}

/**
 * A student's running grade in a class: the percentage their work gives,
 * and what it is made of. The teacher's book counts every mark given;
 * what a learner is shown counts only work returned to them, so a mark not
 * yet returned changes nothing they see.
 */
export function runningGrade(
  work: readonly {
    id: string;
    categoryId: string | null;
    points: number | null;
  }[],
  resultOf: (assignmentId: string) => BookResult | undefined,
  categories: readonly { id: string; weight: number }[],
  counted: "marked" | "returned",
): { percent: number | null; parts: RunningPart[] } {
  const rows = work.flatMap((item) => {
    const result = resultOf(item.id);
    if (counted === "returned" && !result?.released) return [];
    return [
      {
        assignmentId: item.id,
        categoryId: item.categoryId,
        points: item.points,
        score: result?.effectiveScore ?? result?.score ?? null,
        excused: result?.excused ?? false,
      },
    ];
  });
  const weights = workWeights(rows, categories);
  return {
    percent: termPercent(rows, categories),
    parts: rows.map((row, index) => {
      const weight = weights[index] ?? null;
      return {
        assignmentId: row.assignmentId,
        score: row.score,
        points: row.points,
        excused: row.excused,
        weight: weight === null ? null : weight * 100,
      };
    }),
  };
}
