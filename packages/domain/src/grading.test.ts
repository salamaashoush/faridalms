import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { bandFor, bandsSchema, SCALE_PRESETS, termPercent } from "./grading";

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
