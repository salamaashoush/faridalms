import { describe, expect, it } from "vitest";

import type { RolloverPlan } from "./rollover";

import {
  firstOutcome,
  followsClass,
  rolloverPlanIssue,
  rolloverYearsIssue,
} from "./rollover";

const key = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const cls = {
  key: key(1),
  sourceClassId: key(5),
  carrier: "homerooms",
  include: true,
  students: false,
  code: "8-A",
  titleEn: "8A",
  titleAr: "",
  parts: { grade: { gradeId: "" } },
  locationId: "",
  teacherId: "",
  subjects: [],
};

function plan(overrides: Partial<RolloverPlan> = {}): RolloverPlan {
  return {
    classes: [
      cls,
      {
        ...cls,
        key: key(2),
        sourceClassId: key(6),
        include: false,
        code: "8-B",
      },
    ],
    students: [{ studentId: key(7), outcome: "promote", targetKey: key(1) }],
    ...overrides,
  };
}

describe("rolloverPlanIssue", () => {
  it("accepts a student promoted into an included class", () => {
    expect(rolloverPlanIssue(plan())).toBeNull();
  });

  it("refuses a target that is excluded or missing", () => {
    expect(
      rolloverPlanIssue(
        plan({
          students: [
            { studentId: key(7), outcome: "retain", targetKey: key(2) },
          ],
        }),
      ),
    ).toBe("rollover.missing_target");
    expect(
      rolloverPlanIssue(
        plan({
          students: [
            { studentId: key(7), outcome: "promote", targetKey: key(4) },
          ],
        }),
      ),
    ).toBe("rollover.missing_target");
  });

  it("accepts a staying student with no target, as a school without a carrier has", () => {
    expect(
      rolloverPlanIssue(
        plan({
          students: [{ studentId: key(7), outcome: "promote", targetKey: "" }],
        }),
      ),
    ).toBeNull();
  });

  it("refuses a class of its own as a student's target, since its students follow it", () => {
    expect(
      rolloverPlanIssue(
        plan({
          classes: [{ ...cls, carrier: "", students: true }],
          students: [
            { studentId: key(7), outcome: "promote", targetKey: key(1) },
          ],
        }),
      ),
    ).toBe("rollover.missing_target");
  });

  it("refuses a leaver with a target and a student listed twice", () => {
    expect(
      rolloverPlanIssue(
        plan({
          students: [
            { studentId: key(7), outcome: "leave", targetKey: key(1) },
          ],
        }),
      ),
    ).toBe("rollover.target_for_leaver");
    const student = plan().students[0];
    if (!student) throw new Error("Missing student");
    expect(rolloverPlanIssue(plan({ students: [student, student] }))).toBe(
      "rollover.duplicate_student",
    );
  });

  it("refuses two included classes with the same code and a class with no name", () => {
    expect(
      rolloverPlanIssue(
        plan({ classes: [cls, { ...cls, key: key(3), code: "8-a " }] }),
      ),
    ).toBe("rollover.duplicate_code");
    expect(
      rolloverPlanIssue(plan({ classes: [{ ...cls, titleEn: " " }] })),
    ).toBe("rollover.class_name");
  });
});

describe("rolloverYearsIssue", () => {
  const source = {
    startsOn: "2026-09-01",
    endsBefore: "2027-07-01",
    lifecycle: "current" as const,
  };
  const target = {
    startsOn: "2027-09-01",
    endsBefore: "2028-07-01",
    lifecycle: "upcoming" as const,
  };
  const today = "2027-05-01";

  it("wants the target to start on or after the day the source ends", () => {
    expect(rolloverYearsIssue(source, target, today)).toBeNull();
    expect(
      rolloverYearsIssue(source, { ...target, startsOn: "2027-06-30" }, today),
    ).toBe("rollover.overlap");
  });

  it("refuses a closed year on either side and a source not yet started", () => {
    expect(
      rolloverYearsIssue(source, { ...target, lifecycle: "closed" }, today),
    ).toBe("school_year.closed");
    expect(
      rolloverYearsIssue({ ...source, lifecycle: "closed" }, target, today),
    ).toBe("school_year.closed");
    expect(rolloverYearsIssue(source, target, "2026-08-01")).toBe(
      "rollover.source_not_started",
    );
  });
});

describe("firstOutcome", () => {
  it("starts a leaving family's child as leaving, unless the office already decided", () => {
    expect(firstOutcome(null, "leaving")).toBe("leave");
    expect(firstOutcome(null, "returning")).toBe("promote");
    expect(firstOutcome(null, "undecided")).toBe("promote");
    expect(firstOutcome(null, null)).toBe("promote");
    expect(firstOutcome("retain", "leaving")).toBe("retain");
    expect(firstOutcome("promote", "leaving")).toBe("promote");
    expect(firstOutcome("graduate", null)).toBe("graduate");
  });
});

describe("followsClass", () => {
  it("takes every student into the carried class but those leaving or graduating", () => {
    expect(followsClass("promote")).toBe(true);
    expect(followsClass("retain")).toBe(true);
    expect(followsClass(undefined)).toBe(true);
    expect(followsClass("leave")).toBe(false);
    expect(followsClass("graduate")).toBe(false);
  });
});
