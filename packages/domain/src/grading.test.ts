import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { BookResult } from "./grading";

import {
  bandFor,
  bandsSchema,
  gradeOf,
  runningGrade,
  SCALE_PRESETS,
  termPercent,
} from "./grading";

const preset = (key: string) => {
  const found = SCALE_PRESETS.find((row) => row.key === key);
  if (!found) throw new Error(`no preset ${key}`);
  return found.bands;
};

describe("grade bands", () => {
  it("gives the highest grade a percentage reaches", () => {
    const bands = preset("igcse_a_star_g");
    expect(bandFor(bands, 95)?.labelEn).toBe("A*");
    expect(bandFor(bands, 90)?.labelEn).toBe("A*");
    expect(bandFor(bands, 89.9)?.labelEn).toBe("A");
    expect(bandFor(bands, 0)?.labelEn).toBe("U");
  });

  it("reads the MYP's published boundaries out of 32", () => {
    const bands = preset("ib_myp");
    const grade = (points: number) => bandFor(bands, (points / 32) * 100);
    expect(grade(28)?.labelEn).toBe("7");
    expect(grade(27)?.labelEn).toBe("6");
    expect(grade(19)?.labelEn).toBe("5");
    expect(grade(15)?.labelEn).toBe("4");
    expect(grade(10)?.labelEn).toBe("3");
    expect(grade(6)?.labelEn).toBe("2");
    expect(grade(5)?.labelEn).toBe("1");
  });

  it("names Egyptian bands in both languages and carries US GPA points", () => {
    expect(bandFor(preset("egypt_bands"), 80)).toMatchObject({
      labelEn: "Very good",
      labelAr: "جيد جدًا",
    });
    expect(bandFor(preset("us_plus_minus"), 91)).toMatchObject({
      labelEn: "A-",
      gpa: 3.7,
    });
  });

  it("accepts every preset and refuses bands that leave a score without a grade", () => {
    for (const row of SCALE_PRESETS)
      expect(v.safeParse(bandsSchema, row.bands).success).toBe(true);
    const noFloor = preset("a_level").filter((band) => band.minPercent > 0);
    expect(v.safeParse(bandsSchema, noFloor).issues?.[0]?.message).toBe(
      "grading.no_floor",
    );
    const repeated = [...preset("a_level"), preset("a_level")[0]];
    expect(v.safeParse(bandsSchema, repeated).success).toBe(false);
  });
});

function work(
  categoryId: string | null,
  score: number | null,
  points = 10,
  excused = false,
) {
  return { categoryId, score, points, excused };
}

describe("term percentage", () => {
  it("weighs categories and shares the weight of empty ones", () => {
    const categories = [
      { id: "tests", weight: 40 },
      { id: "coursework", weight: 40 },
      { id: "homework", weight: 20 },
    ];
    const rows = [
      work("tests", 8),
      work("tests", 6),
      work("coursework", 9),
      work("coursework", null),
    ];
    // Tests 70%, coursework 90%, homework has nothing graded yet.
    expect(termPercent(rows, categories)).toBeCloseTo(80);
  });

  it("counts every piece by its points without categories, skipping excused work", () => {
    const rows = [
      work(null, 5, 10),
      work(null, 30, 40),
      work(null, 0, 10, true),
    ];
    expect(termPercent(rows, [])).toBeCloseTo(70);
  });

  it("has no percentage before anything is graded", () => {
    expect(termPercent([work(null, null)], [])).toBeNull();
  });
});

function result(
  score: number | null,
  released: boolean,
  extra: Partial<BookResult> = {},
): BookResult {
  return { score, effectiveScore: null, excused: false, released, ...extra };
}

describe("running grade", () => {
  const categories = [
    { id: "tests", weight: 40 },
    { id: "coursework", weight: 40 },
    { id: "homework", weight: 20 },
  ];
  const columns = [
    { id: "t1", categoryId: "tests", points: 10 },
    { id: "t2", categoryId: "tests", points: 10 },
    { id: "c1", categoryId: "coursework", points: 10 },
    { id: "c2", categoryId: "coursework", points: 10 },
  ];
  const results: Record<string, BookResult> = {
    t1: result(8, true),
    t2: result(6, true),
    c1: result(9, true),
    c2: result(5, false),
  };
  const of = (id: string) => results[id];

  it("is the term percentage of the book, worked out from the same rows", () => {
    const marked = runningGrade(columns, of, categories, "marked");
    expect(marked.percent).toBeCloseTo(
      termPercent(
        columns.map((item) => ({
          categoryId: item.categoryId,
          points: item.points,
          score: results[item.id]?.score ?? null,
          excused: false,
        })),
        categories,
      ) ?? Number.NaN,
    );
    // Tests 70%, coursework 70%: the mark not yet returned counts in the book.
    expect(marked.percent).toBeCloseTo(70);
  });

  it("counts for the learner only the work returned to them", () => {
    const returned = runningGrade(columns, of, categories, "returned");
    // Tests 70%, coursework 90%, homework nothing yet.
    expect(returned.percent).toBeCloseTo(80);
    expect(returned.parts.map((part) => part.assignmentId)).toEqual([
      "t1",
      "t2",
      "c1",
    ]);
    // Each test is half of the tests' half; the one coursework is all of its half.
    expect(returned.parts.map((part) => part.weight)).toEqual([25, 25, 50]);
  });

  it("gives the weights of the parts that count as a whole", () => {
    const { parts } = runningGrade(columns, of, categories, "marked");
    const total = parts.reduce((sum, part) => sum + (part.weight ?? 0), 0);
    expect(total).toBeCloseTo(100);
  });

  it("has no grade and no parts before any work is returned", () => {
    const none = runningGrade(
      columns,
      (id) => (id === "t1" ? result(9, false) : undefined),
      categories,
      "returned",
    );
    expect(none).toEqual({ percent: null, parts: [] });
  });

  it("has no grade when every returned piece is excused, and shows each as not counting", () => {
    const excused = runningGrade(
      columns.slice(0, 2),
      () => result(null, true, { excused: true }),
      categories,
      "returned",
    );
    expect(excused.percent).toBeNull();
    expect(excused.parts).toEqual([
      {
        assignmentId: "t1",
        score: null,
        points: 10,
        excused: true,
        weight: null,
      },
      {
        assignmentId: "t2",
        score: null,
        points: 10,
        excused: true,
        weight: null,
      },
    ]);
  });

  it("shares weights that do not add up to a hundred among the categories with work", () => {
    const uneven = [
      { id: "tests", weight: 30 },
      { id: "coursework", weight: 10 },
    ];
    const grade = runningGrade(columns, of, uneven, "returned");
    // Tests 70% at three quarters, coursework 90% at one quarter.
    expect(grade.percent).toBeCloseTo(75);
    expect(grade.parts.map((part) => part.weight)).toEqual([37.5, 37.5, 25]);
  });

  it("counts late work at its score after the deduction, and leaves out work in no category", () => {
    const grade = runningGrade(
      [...columns, { id: "loose", categoryId: null, points: 10 }],
      (id) =>
        id === "t1"
          ? result(10, true, { effectiveScore: 8 })
          : id === "loose"
            ? result(0, true)
            : results[id],
      categories,
      "returned",
    );
    expect(grade.percent).toBeCloseTo(80);
    expect(
      grade.parts.find((part) => part.assignmentId === "t1"),
    ).toMatchObject({ score: 8 });
    expect(
      grade.parts.find((part) => part.assignmentId === "loose")?.weight,
    ).toBeNull();
  });

  it("keeps its percentage when the scale changes mid-run, and is graded on today's bands", () => {
    const grade = runningGrade(columns, of, [], "returned");
    expect(grade.percent).toBeCloseTo(76.67, 2);
    const before = {
      bands: preset("us_letter"),
      display: "grade_score" as const,
    };
    const after = {
      bands: preset("egypt_bands"),
      display: "grade_score" as const,
    };
    expect(gradeOf(before, grade.percent, 100)?.labelEn).toBe("C");
    expect(gradeOf(after, grade.percent, 100)?.labelEn).toBe("Very good");
    // A returned mark keeps the grade of the bands it was given under.
    expect(gradeOf(before, 9, 10)?.labelEn).toBe("A");
  });
});
