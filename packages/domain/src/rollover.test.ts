import { describe, expect, it } from "vitest";

import type { RolloverPlan } from "./rollover";

import { rolloverPlanIssue, rolloverYearsIssue } from "./rollover";

const key = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function plan(overrides: Partial<RolloverPlan> = {}): RolloverPlan {
  return {
    classes: [
      {
        key: key(1),
        sourceClassId: key(5),
        include: true,
        name: "P2-A",
        grade: "P2",
        stage: "primary",
        room: "",
        homeroomTeacherId: "",
        subjects: [],
      },
      {
        key: key(2),
        sourceClassId: key(6),
        include: false,
        name: "P2-B",
        grade: "P2",
        stage: "primary",
        room: "",
        homeroomTeacherId: "",
        subjects: [],
      },
    ],
    students: [
      {
        studentId: key(7),
        sourceClassId: key(5),
        decision: "promote",
        targetKey: key(1),
      },
    ],
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
            {
              studentId: key(7),
              sourceClassId: key(6),
              decision: "repeat",
              targetKey: key(2),
            },
          ],
        }),
      ),
    ).toBe("rollover.missing_target");
  });

  it("refuses a withdrawn student with a target and a student listed twice", () => {
    expect(
      rolloverPlanIssue(
        plan({
          students: [
            {
              studentId: key(7),
              sourceClassId: key(5),
              decision: "withdraw",
              targetKey: key(1),
            },
          ],
        }),
      ),
    ).toBe("rollover.withdraw_target");
    const student = plan().students[0];
    if (!student) throw new Error("Missing student");
    expect(rolloverPlanIssue(plan({ students: [student, student] }))).toBe(
      "rollover.duplicate_student",
    );
  });

  it("refuses two included classes with the same name", () => {
    const [first] = plan().classes;
    if (!first) throw new Error("Missing class");
    expect(
      rolloverPlanIssue(
        plan({
          classes: [first, { ...first, key: key(3), name: "p2-a " }],
        }),
      ),
    ).toBe("rollover.duplicate_name");
  });
});

describe("rolloverYearsIssue", () => {
  const source = {
    startsOn: "2026-09-01",
    endsOn: "2027-06-30",
    status: "active",
  };

  it("wants the target to start after the source ends", () => {
    expect(
      rolloverYearsIssue(source, {
        startsOn: "2027-09-01",
        status: "planning",
      }),
    ).toBeNull();
    expect(
      rolloverYearsIssue(source, {
        startsOn: "2027-06-30",
        status: "planning",
      }),
    ).toBe("rollover.overlap");
  });

  it("refuses a closed year on either side and a source still being planned", () => {
    expect(
      rolloverYearsIssue(source, { startsOn: "2027-09-01", status: "closed" }),
    ).toBe("academic_year.closed");
    expect(
      rolloverYearsIssue(
        { ...source, status: "closed" },
        { startsOn: "2027-09-01", status: "planning" },
      ),
    ).toBe("academic_year.closed");
    expect(
      rolloverYearsIssue(
        { ...source, status: "planning" },
        { startsOn: "2027-09-01", status: "planning" },
      ),
    ).toBe("rollover.source_planning");
  });
});
