import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_NORMS,
  fallingPercentiles,
  normStanding,
  passageLanguage,
  practiseWords,
  prosodyTotal,
  readingNormsSchema,
  seasonOf,
} from "./reading";

describe("reading norms", () => {
  it("start from Hasbrouck and Tindal's English norms, each grade at each time of year once", () => {
    expect(v.safeParse(readingNormsSchema, DEFAULT_NORMS.en).success).toBe(
      true,
    );
    expect(DEFAULT_NORMS.en).toHaveLength(18);
    expect(
      DEFAULT_NORMS.en.find(
        (row) => row.grade === "grade_3" && row.season === "winter",
      ),
    ).toMatchObject({ p10: 62, p25: 79, p50: 97, p75: 137, p90: 161 });
    expect(
      DEFAULT_NORMS.en.find(
        (row) => row.grade === "grade_1" && row.season === "fall",
      )?.p50,
    ).toBeNull();
    expect(DEFAULT_NORMS.ar).toEqual([]);
  });

  it("refuse a grade given twice for one time of year", () => {
    const row = DEFAULT_NORMS.en[3];
    expect(v.safeParse(readingNormsSchema, [row, row]).success).toBe(false);
  });

  it("refuse a percentile written lower than one before it, skipping blanks", () => {
    const row = {
      grade: "grade_2",
      season: "fall" as const,
      p10: 20,
      p25: null,
      p50: 50,
      p75: 40,
      p90: 45,
    };
    expect(fallingPercentiles(row)).toEqual(["p75", "p90"]);
    expect(v.safeParse(readingNormsSchema, [row]).success).toBe(false);
    expect(fallingPercentiles({ ...row, p75: 60, p90: 60 })).toEqual([]);
    expect(
      DEFAULT_NORMS.en.flatMap((item) => fallingPercentiles(item)),
    ).toEqual([]);
  });

  it("read the time of year from the month", () => {
    expect(seasonOf("2026-09-14")).toBe("fall");
    expect(seasonOf("2027-01-20")).toBe("winter");
    expect(seasonOf("2026-12-01")).toBe("winter");
    expect(seasonOf("2027-05-02")).toBe("spring");
  });

  it("call a reading ten words or more from the 50th percentile below or above it", () => {
    const row = DEFAULT_NORMS.en.find(
      (item) => item.grade === "grade_2" && item.season === "spring",
    );
    expect(normStanding(90, row)).toBe("below");
    expect(normStanding(95, row)).toBe("near");
    expect(normStanding(110, row)).toBe("above");
    expect(normStanding(110, undefined)).toBeNull();
  });
});

describe("reading aloud", () => {
  it("knows an Arabic passage by its letters", () => {
    expect(passageLanguage("ذهب الولد إلى المدرسة")).toBe("ar");
    expect(passageLanguage("The cat sat.")).toBe("en");
  });

  it("gives the words to practise once each, without punctuation, up to where the reading stopped", () => {
    const passage = "The cat sat on the mat. The cat, it slept.";
    expect(
      practiseWords(passage, { errors: [1, 7, 5, 9], lastWord: 8 }),
    ).toEqual(["cat", "mat"]);
  });

  it("totals prosody only once every part is scored", () => {
    expect(
      prosodyTotal({ expression: 3, phrasing: 2, smoothness: 4, pace: 3 }),
    ).toBe(12);
    expect(prosodyTotal({ expression: 3 })).toBeNull();
  });
});
