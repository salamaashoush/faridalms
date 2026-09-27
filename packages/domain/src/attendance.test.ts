import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  emptyCounts,
  isChronic,
  isUnexplained,
  registerMarkSchema,
  registerState,
  saveRegisterSchema,
  summarise,
  teacherMayEdit,
} from "./attendance";

const student = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b4c";
const other = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b4d";

describe("marks", () => {
  it("takes minutes only for late arrivals and early departures", () => {
    expect(
      v.safeParse(registerMarkSchema, {
        studentId: student,
        meaning: "late",
        minutes: 12,
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(registerMarkSchema, {
        studentId: student,
        meaning: "absent",
        minutes: 12,
      }).success,
    ).toBe(false);
  });

  it("refuses two marks for one student in a register", () => {
    const mark = { studentId: student, meaning: "present" };
    expect(
      v.safeParse(saveRegisterSchema, {
        classId: student,
        date: "2026-09-27",
        periodId: other,
        expectedVersion: 0,
        marks: [mark, mark],
      }).success,
    ).toBe(false);
  });

  it("calls an absence or late arrival unexplained until it has a reason", () => {
    expect(isUnexplained("absent", null)).toBe(true);
    expect(isUnexplained("late", null)).toBe(true);
    expect(isUnexplained("absent", other)).toBe(false);
    expect(isUnexplained("excused", null)).toBe(false);
  });
});

describe("registers", () => {
  it("is submitted once every student on the roster has a mark", () => {
    expect(registerState([student, other], new Set([student]))).toBe(
      "in_progress",
    );
    expect(registerState([student, other], new Set([student, other]))).toBe(
      "submitted",
    );
    expect(registerState([], new Set())).toBe("in_progress");
  });

  it("lets a teacher change a register within the window and never ahead", () => {
    expect(teacherMayEdit("2026-09-27", "2026-09-27", 0)).toBe(true);
    expect(teacherMayEdit("2026-09-20", "2026-09-27", 7)).toBe(true);
    expect(teacherMayEdit("2026-09-19", "2026-09-27", 7)).toBe(false);
    expect(teacherMayEdit("2026-09-28", "2026-09-27", 7)).toBe(false);
  });
});

describe("summaries", () => {
  it("counts late arrivals and early departures as attended", () => {
    const summary = summarise({
      ...emptyCounts(),
      present: 15,
      late: 2,
      left_early: 1,
      absent: 1,
      excused: 1,
    });
    expect(summary.sessions).toBe(20);
    expect(summary.rate).toBe(90);
    expect(isChronic(summary, 10)).toBe(true);
    expect(isChronic(summary, 11)).toBe(false);
  });

  it("has no rate before any register was taken", () => {
    const summary = summarise(emptyCounts());
    expect(summary.rate).toBeNull();
    expect(isChronic(summary, 10)).toBe(false);
  });
});
