import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  absenceReportSchema,
  emptyCounts,
  isChronic,
  isUnexplained,
  minutesLate,
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

describe("absence reports", () => {
  const report = {
    studentId: "01a0e2ff-cf61-7440-862a-a2f67c1c0d11",
    reasonId: "01a0e2ff-cf61-7440-862a-a2f67c1c0d12",
    from: "2026-10-05",
    to: "2026-10-07",
  };

  it("takes days away without a time", () => {
    expect(v.is(absenceReportSchema, { ...report, kind: "absent" })).toBe(true);
    expect(
      v.is(absenceReportSchema, { ...report, kind: "absent", at: "10:00" }),
    ).toBe(false);
  });

  it("takes a late arrival or early leave on one day, with its time", () => {
    const day = { ...report, to: report.from };
    expect(
      v.is(absenceReportSchema, { ...day, kind: "late", at: "10:30" }),
    ).toBe(true);
    expect(v.is(absenceReportSchema, { ...day, kind: "early" })).toBe(false);
    expect(
      v.is(absenceReportSchema, { ...report, kind: "early", at: "12:00" }),
    ).toBe(false);
  });

  it("refuses days that end before they start", () => {
    expect(
      v.is(absenceReportSchema, {
        ...report,
        kind: "absent",
        from: report.to,
        to: report.from,
      }),
    ).toBe(false);
  });
});

describe("lateness", () => {
  it("counts minutes after the start once past the grace", () => {
    expect(minutesLate("08:00", "08:05", 5)).toBeNull();
    expect(minutesLate("08:00", "08:06", 5)).toBe(6);
    expect(minutesLate("08:00", "09:10", 5)).toBe(70);
  });

  it("never counts an arrival before the start", () => {
    expect(minutesLate("08:00", "07:40", 0)).toBeNull();
  });
});
