import { describe, expect, it } from "vitest";

import { assignmentWindow, learnerState } from "./assignment";

describe("assignmentWindow", () => {
  const schedule = {
    availableFrom: "2026-09-10T06:00:00.000Z",
    dueAt: "2026-09-20T12:00:00.000Z",
    closesAt: "2026-09-22T12:00:00.000Z",
    latePolicy: "accepted",
  } as const;

  it("moves through scheduled, open, late and closed", () => {
    expect(assignmentWindow(schedule, "2026-09-09T00:00:00Z")).toBe(
      "scheduled",
    );
    expect(assignmentWindow(schedule, "2026-09-15T00:00:00Z")).toBe("open");
    expect(assignmentWindow(schedule, "2026-09-21T00:00:00Z")).toBe("late");
    expect(assignmentWindow(schedule, "2026-09-23T00:00:00Z")).toBe("closed");
  });

  it("closes at the due date when late work is not accepted", () => {
    expect(
      assignmentWindow(
        { ...schedule, latePolicy: "not_accepted" },
        "2026-09-21T00:00:00Z",
      ),
    ).toBe("closed");
  });

  it("stays late without a close date", () => {
    expect(
      assignmentWindow({ ...schedule, closesAt: null }, "2027-01-01T00:00:00Z"),
    ).toBe("late");
  });
});

describe("learnerState", () => {
  it("derives the learner state from attempts, drafts and the window", () => {
    expect(
      learnerState({
        window: "open",
        hasDraft: false,
        attempts: 0,
        released: false,
      }),
    ).toBe("not_started");
    expect(
      learnerState({
        window: "open",
        hasDraft: true,
        attempts: 0,
        released: false,
      }),
    ).toBe("draft");
    expect(
      learnerState({
        window: "closed",
        hasDraft: true,
        attempts: 0,
        released: false,
      }),
    ).toBe("missing");
    expect(
      learnerState({
        window: "closed",
        hasDraft: false,
        attempts: 1,
        released: false,
      }),
    ).toBe("submitted");
    expect(
      learnerState({
        window: "open",
        hasDraft: false,
        attempts: 2,
        released: true,
      }),
    ).toBe("returned");
    expect(
      learnerState({
        window: "scheduled",
        hasDraft: false,
        attempts: 0,
        released: false,
      }),
    ).toBe("scheduled");
  });
});
