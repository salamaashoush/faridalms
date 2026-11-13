import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { GradeStretch } from "./grade-levels";

import {
  gradeChange,
  gradeOn,
  gradeViewSchema,
  nextGrade,
  saveGradeLevelSchema,
} from "./grade-levels";

const G1 = "11111111-1111-4111-8111-111111111111";
const G2 = "22222222-2222-4222-8222-222222222222";
const G3 = "33333333-3333-4333-8333-333333333333";

const stretch = (
  id: string,
  gradeId: string,
  from: string,
  until: string | null,
): GradeStretch => ({ id, gradeId, from, until });

describe("grade change", () => {
  it("starts a first grade from the day, open at the end", () => {
    expect(gradeChange([], { gradeId: G1, from: "2026-09-01" })).toEqual({
      kind: "insert",
      end: null,
      from: "2026-09-01",
      until: null,
    });
  });

  it("changes nothing when the student is already in that grade that day", () => {
    const rows = [stretch("a", G1, "2026-09-01", null)];
    expect(gradeChange(rows, { gradeId: G1, from: "2026-11-12" })).toEqual({
      kind: "none",
    });
  });

  it("ends the running grade on the day and runs the new one as far as it did", () => {
    const rows = [stretch("a", G1, "2026-09-01", null)];
    expect(gradeChange(rows, { gradeId: G2, from: "2026-11-12" })).toEqual({
      kind: "insert",
      end: "a",
      from: "2026-11-12",
      until: null,
    });
  });

  it("changes a grade in place when it starts that same day", () => {
    const rows = [stretch("a", G1, "2026-11-12", null)];
    expect(gradeChange(rows, { gradeId: G2, from: "2026-11-12" })).toEqual({
      kind: "regrade",
      id: "a",
      gradeId: G2,
    });
  });

  it("keeps a change already scheduled for later, the new grade running until it", () => {
    const rows = [
      stretch("a", G1, "2026-09-01", "2027-09-01"),
      stretch("b", G2, "2027-09-01", null),
    ];
    expect(gradeChange(rows, { gradeId: G3, from: "2026-11-12" })).toEqual({
      kind: "insert",
      end: "a",
      from: "2026-11-12",
      until: "2027-09-01",
    });
  });

  it("runs a grade set before any held only until the first one held", () => {
    const rows = [stretch("b", G2, "2027-09-01", null)];
    expect(gradeChange(rows, { gradeId: G1, from: "2026-11-12" })).toEqual({
      kind: "insert",
      end: null,
      from: "2026-11-12",
      until: "2027-09-01",
    });
  });

  it("finds the stretch a student is in on a day, the day it ends excluded", () => {
    const rows = [
      stretch("a", G1, "2026-09-01", "2027-09-01"),
      stretch("b", G2, "2027-09-01", null),
    ];
    expect(gradeOn(rows, "2027-08-31")?.id).toBe("a");
    expect(gradeOn(rows, "2027-09-01")?.id).toBe("b");
    expect(gradeOn(rows, "2026-08-31")).toBeNull();
  });
});

describe("grades in order", () => {
  const grades = [{ id: G1 }, { id: G2 }, { id: G3 }];

  it("moves a class into the next grade, and keeps the last where it is", () => {
    expect(nextGrade(grades, G1)).toBe(G2);
    expect(nextGrade(grades, G3)).toBe(G3);
  });

  it("leaves a class with no grade, or one the school no longer lists, as it was", () => {
    expect(nextGrade(grades, null)).toBe("");
    expect(nextGrade(grades, "x")).toBe("x");
  });
});

describe("grade schemas", () => {
  it("narrows a list by one grade or several", () => {
    expect(v.is(gradeViewSchema, G1)).toBe(true);
    expect(v.is(gradeViewSchema, [G1, G2])).toBe(true);
    expect(v.is(gradeViewSchema, [])).toBe(false);
    expect(v.is(gradeViewSchema, "grade-8")).toBe(false);
  });

  it("adds a level with a code, and renames one by id, never both", () => {
    expect(
      v.is(saveGradeLevelSchema, {
        code: "beginner",
        labelEn: "Beginner",
        labelAr: "",
      }),
    ).toBe(true);
    expect(
      v.is(saveGradeLevelSchema, {
        id: G1,
        labelEn: "Level 1",
        labelAr: "",
        expected: { labelEn: "Grade 1", labelAr: "" },
      }),
    ).toBe(true);
    expect(
      v.is(saveGradeLevelSchema, {
        id: G1,
        code: "x",
        labelEn: "A",
        labelAr: "",
      }),
    ).toBe(false);
    expect(
      v.is(saveGradeLevelSchema, { code: "x", labelEn: "", labelAr: "" }),
    ).toBe(false);
  });
});
