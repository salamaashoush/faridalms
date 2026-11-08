import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  assignmentPhase,
  canHandIn,
  copyStanding,
  effectiveScore,
  GRACE_MS,
  handInIssue,
  isLate,
  learnerState,
  rubricEvidence,
  rubricSchema,
  rubricTotal,
} from "./coursework";

const due = new Date("2026-10-01T09:00:00Z");
const at = (offsetMs: number) => new Date(due.getTime() + offsetMs);
const schedule = {
  state: "published" as const,
  availableFrom: new Date("2026-09-20T06:00:00Z"),
  dueAt: due,
  closesAt: null,
  latePolicy: "accept" as const,
};

describe("assignmentPhase", () => {
  it("runs from scheduled to assigned to past due", () => {
    expect(assignmentPhase(schedule, new Date("2026-09-19T00:00:00Z"))).toBe(
      "scheduled",
    );
    expect(assignmentPhase(schedule, at(-1000))).toBe("assigned");
    expect(assignmentPhase(schedule, at(GRACE_MS))).toBe("assigned");
    expect(assignmentPhase(schedule, at(GRACE_MS + 1000))).toBe("past_due");
  });

  it("closes at the due time when late work is refused, and at the close date otherwise", () => {
    expect(
      assignmentPhase({ ...schedule, latePolicy: "refuse" }, at(GRACE_MS + 1)),
    ).toBe("closed");
    expect(
      assignmentPhase(
        { ...schedule, closesAt: at(60_000_000) },
        at(60_000_001),
      ),
    ).toBe("closed");
    expect(assignmentPhase({ ...schedule, state: "draft" }, at(0))).toBe(
      "draft",
    );
  });

  it("closes undated work at its close date and keeps it open until then", () => {
    const undated = { ...schedule, dueAt: null, closesAt: at(60_000_000) };
    expect(assignmentPhase(undated, at(59_999_999))).toBe("assigned");
    expect(assignmentPhase(undated, at(60_000_001))).toBe("closed");
    expect(
      assignmentPhase({ ...undated, latePolicy: "refuse" }, at(30_000_000)),
    ).toBe("assigned");
    expect(
      assignmentPhase({ ...undated, closesAt: null }, at(10 * 60_000_000)),
    ).toBe("assigned");
  });
});

describe("handing in", () => {
  it("absorbs the last-minute boundary before marking work late", () => {
    expect(isLate(due, at(GRACE_MS))).toBe(false);
    expect(isLate(due, at(GRACE_MS + 1))).toBe(true);
    expect(isLate(null, at(10 * GRACE_MS))).toBe(false);
  });

  it("allows one attempt, and another only when returned work may be resubmitted", () => {
    const open = { ...schedule, resubmission: false };
    expect(canHandIn(open, 0, false, at(-1))).toBe(true);
    expect(canHandIn(open, 1, true, at(-1))).toBe(false);
    expect(canHandIn({ ...open, resubmission: true }, 1, true, at(-1))).toBe(
      true,
    );
    expect(canHandIn({ ...open, resubmission: true }, 1, false, at(-1))).toBe(
      false,
    );
    expect(
      canHandIn({ ...open, latePolicy: "refuse" }, 0, false, at(GRACE_MS + 1)),
    ).toBe(false);
  });

  it("asks for written work and files together only when the format requires both", () => {
    const none = { written: false, files: false };
    const written = { written: true, files: false };
    const files = { written: false, files: true };
    const all = { written: true, files: true };
    expect(handInIssue("both", written)).toBeNull();
    expect(handInIssue("both", files)).toBeNull();
    expect(handInIssue("both", none)).toBe("coursework.nothing_to_hand_in");
    expect(handInIssue("online_and_files", all)).toBeNull();
    expect(handInIssue("online_and_files", written)).toBe(
      "coursework.files_needed",
    );
    expect(handInIssue("online_and_files", files)).toBe(
      "coursework.written_needed",
    );
    expect(handInIssue("online_and_files", none)).toBe(
      "coursework.nothing_to_hand_in",
    );
    expect(handInIssue("online", files)).toBe("coursework.nothing_to_hand_in");
    expect(handInIssue("files", written)).toBe("coursework.nothing_to_hand_in");
    expect(handInIssue("none", none)).toBeNull();
  });

  it("stops hand-in at the close date of work with no due date", () => {
    const undated = {
      ...schedule,
      dueAt: null,
      closesAt: at(60_000_000),
      resubmission: false,
    };
    expect(canHandIn(undated, 0, false, at(60_000_000))).toBe(true);
    expect(canHandIn(undated, 0, false, at(60_000_001))).toBe(false);
  });
});

describe("effectiveScore", () => {
  it("deducts only from late work under a deduction policy", () => {
    const deduct = { latePolicy: "deduct" as const, lateDeductionPercent: 10 };
    expect(effectiveScore(8, true, deduct)).toBe(7.2);
    expect(effectiveScore(8, false, deduct)).toBe(8);
    expect(
      effectiveScore(8, true, {
        latePolicy: "accept",
        lateDeductionPercent: null,
      }),
    ).toBe(8);
    expect(effectiveScore(null, true, deduct)).toBeNull();
  });
});

describe("learnerState", () => {
  const base = {
    availableFrom: schedule.availableFrom,
    dueAt: due,
    excused: false,
    needsRevision: false,
    hasDraft: false,
    latestAttempt: null,
    released: false,
  };

  it("reads to do, in progress and missing from the draft and the clock", () => {
    expect(learnerState(base, at(-1000))).toBe("to_do");
    expect(learnerState({ ...base, hasDraft: true }, at(-1000))).toBe(
      "in_progress",
    );
    expect(learnerState(base, at(GRACE_MS + 1000))).toBe("missing");
    expect(learnerState(base, new Date("2026-09-19T00:00:00Z"))).toBe(
      "not_available",
    );
  });

  it("puts excused, revision and return ahead of handed in", () => {
    const handed = { ...base, latestAttempt: { isLate: true } };
    expect(learnerState(handed, at(GRACE_MS + 1000))).toBe("handed_in_late");
    expect(learnerState({ ...handed, released: true }, at(0))).toBe("returned");
    expect(learnerState({ ...handed, needsRevision: true }, at(0))).toBe(
      "needs_revision",
    );
    expect(learnerState({ ...handed, excused: true }, at(0))).toBe("excused");
  });
});

describe("rubricTotal", () => {
  it("adds the best level of every criterion", () => {
    expect(
      rubricTotal({
        criteria: [
          {
            id: "a",
            title: "A",
            levels: [
              { id: "hi", title: "High", points: 6 },
              { id: "lo", title: "Low", points: 2 },
            ],
          },
          {
            id: "b",
            title: "B",
            levels: [{ id: "ok", title: "OK", points: 4 }],
          },
        ],
      }),
    ).toBe(10);
  });
});

describe("rubricEvidence", () => {
  const standard = "019a0000-0000-7000-8000-000000000001";
  const other = "019a0000-0000-7000-8000-000000000002";
  const argument = {
    id: "argument",
    title: "Argument",
    standards: [standard, other],
    levels: [
      { id: "exceeds", title: "Exceeds", points: 4 },
      { id: "approaching", title: "Approaching", points: 2 },
      { id: "beginning", title: "Beginning", points: 0 },
    ],
  };
  const rubric = {
    criteria: [
      argument,
      {
        id: "spelling",
        title: "Spelling",
        levels: [{ id: "ok", title: "OK", points: 2 }],
      },
      {
        id: "effort",
        title: "Effort",
        standards: [standard],
        levels: [{ id: "none", title: "None", points: 0 }],
      },
    ],
  };

  it("counts the level awarded as a share of the criterion's best", () => {
    expect(
      rubricEvidence(rubric, { argument: "approaching", spelling: "ok" }),
    ).toEqual([
      { criterionId: "argument", standards: [standard, other], fraction: 0.5 },
    ]);
    expect(rubricEvidence(rubric, { argument: "beginning" })).toEqual([
      { criterionId: "argument", standards: [standard, other], fraction: 0 },
    ]);
  });

  it("skips criteria left unmarked, untagged or worth nothing", () => {
    expect(rubricEvidence(rubric, { spelling: "ok", effort: "none" })).toEqual(
      [],
    );
    expect(rubricEvidence(rubric, { argument: "gone" })).toEqual([]);
  });

  it("refuses a criterion carrying a standard twice", () => {
    const twice = {
      criteria: [{ ...argument, standards: [standard, standard] }],
    };
    expect(v.safeParse(rubricSchema, twice).success).toBe(false);
    expect(v.safeParse(rubricSchema, rubric).success).toBe(true);
  });
});

describe("copyStanding", () => {
  const lineage = new Map([
    ["copy", { copiedFrom: "sheet", createdAt: "2026-10-01T08:00:00.000Z" }],
    ["frozen", { copiedFrom: "copy", createdAt: "2026-10-02T08:00:00.000Z" }],
    ["mine", { copiedFrom: null, createdAt: "2026-10-03T08:00:00.000Z" }],
    ["map", { copiedFrom: null, createdAt: "2026-10-04T08:00:00.000Z" }],
  ]);

  it("counts nothing while the student still holds the copy they were given", () => {
    expect(
      copyStanding({
        starters: ["sheet"],
        blocks: [{ fileId: "copy", origin: null }],
        lineage,
      }),
    ).toEqual({ uploaded: 0, at: null });
  });

  it("counts a version put in place of the copy, followed back through copies", () => {
    expect(
      copyStanding({
        starters: ["sheet", "chart"],
        blocks: [
          { fileId: "mine", origin: "frozen" },
          { fileId: "map", origin: null },
        ],
        lineage,
      }),
    ).toEqual({ uploaded: 1, at: "2026-10-03T08:00:00.000Z" });
  });

  it("does not count a file of the student's own added beside the copy", () => {
    expect(
      copyStanding({
        starters: ["sheet"],
        blocks: [
          { fileId: "copy", origin: null },
          { fileId: "map", origin: "map" },
        ],
        lineage,
      }),
    ).toEqual({ uploaded: 0, at: null });
  });
});
