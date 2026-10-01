import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { bandFor, bandsSchema, SCALE_PRESETS } from "./grading";

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
