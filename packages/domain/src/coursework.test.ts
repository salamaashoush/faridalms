import { describe, expect, it } from "vitest";

import {
  assignmentPhase,
  canHandIn,
  effectiveScore,
  GRACE_MS,
  isLate,
  learnerState,
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
