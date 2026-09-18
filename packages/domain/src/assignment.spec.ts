import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  assignmentPublishIssues,
  assignmentWindow,
  canSubmitNow,
  effectiveScore,
  learnerState,
  rubricTotal,
  saveAssignmentSchema,
} from "./assignment";
import { emptyContent } from "./content-conversion";

const base = {
  id: "0d3f7d4e-7a1c-4b5a-9a2e-2e6f1f2a3b4c",
  expectedRevision: 0,
  classId: "0d3f7d4e-7a1c-4b5a-9a2e-2e6f1f2a3b4d",
  subjectId: "0d3f7d4e-7a1c-4b5a-9a2e-2e6f1f2a3b4e",
  type: "written_assignment",
  title: "Salama fractions",
  instructions: emptyContent(),
  recipients: { mode: "class" },
  dueAt: "2026-09-20T12:00:00.000Z",
  latePolicy: "not_accepted",
  lateDeductionPercent: 0,
  submissionFormat: "written",
  maxAttachments: 0,
  maxAttachmentBytes: 1024 * 1024,
  resubmission: "not_allowed",
  maxScore: 10,
} as const;

describe("saveAssignmentSchema", () => {
  it("accepts a minimal draft", () => {
    expect(v.safeParse(saveAssignmentSchema, base).success).toBe(true);
  });

  it("rejects a close before the due date and a due date before availability", () => {
    expect(
      v.safeParse(saveAssignmentSchema, {
        ...base,
        closesAt: "2026-09-19T12:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(saveAssignmentSchema, {
        ...base,
        availableFrom: "2026-09-21T12:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires a deduction when the late policy deducts", () => {
    expect(
      v.safeParse(saveAssignmentSchema, {
        ...base,
        latePolicy: "accepted_with_deduction",
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(saveAssignmentSchema, {
        ...base,
        latePolicy: "accepted_with_deduction",
        lateDeductionPercent: 20,
      }).success,
    ).toBe(true);
  });

  it("requires an attachment allowance when files are expected", () => {
    expect(
      v.safeParse(saveAssignmentSchema, { ...base, submissionFormat: "files" })
        .success,
    ).toBe(false);
  });

  it("requires rubric points to add up to the maximum score", () => {
    const rubric = [
      { id: base.id, title: "Reasoning", maxPoints: 6 },
      { id: base.classId, title: "Presentation", maxPoints: 3 },
    ];
    expect(v.safeParse(saveAssignmentSchema, { ...base, rubric }).success).toBe(
      false,
    );
    expect(
      v.safeParse(saveAssignmentSchema, {
        ...base,
        rubric: [
          ...rubric,
          { id: base.subjectId, title: "Care", maxPoints: 1 },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("assignmentPublishIssues", () => {
  it("names what a draft still lacks", () => {
    const parsed = v.parse(saveAssignmentSchema, {
      ...base,
      title: "ab",
      recipients: { mode: "groups" },
    });
    expect(assignmentPublishIssues(parsed)).toEqual([
      "title",
      "instructions",
      "recipients",
    ]);
  });
});

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

describe("canSubmitNow", () => {
  const schedule = {
    availableFrom: null,
    dueAt: "2026-09-20T12:00:00.000Z",
    closesAt: "2026-09-22T12:00:00.000Z",
    latePolicy: "accepted",
    resubmission: "until_due",
  } as const;

  it("allows a first attempt while late work is accepted", () => {
    expect(canSubmitNow(schedule, 0, "2026-09-21T00:00:00Z")).toBe(true);
  });

  it("limits resubmission to the policy window", () => {
    expect(canSubmitNow(schedule, 1, "2026-09-19T00:00:00Z")).toBe(true);
    expect(canSubmitNow(schedule, 1, "2026-09-21T00:00:00Z")).toBe(false);
    expect(
      canSubmitNow(
        { ...schedule, resubmission: "until_close" },
        1,
        "2026-09-21T00:00:00Z",
      ),
    ).toBe(true);
    expect(
      canSubmitNow(
        { ...schedule, resubmission: "not_allowed" },
        1,
        "2026-09-19T00:00:00Z",
      ),
    ).toBe(false);
  });
});

describe("scores and states", () => {
  it("deducts only for late work under a deduction policy", () => {
    const policy = {
      latePolicy: "accepted_with_deduction",
      lateDeductionPercent: 25,
    } as const;
    expect(effectiveScore(8, true, policy)).toBe(6);
    expect(effectiveScore(8, false, policy)).toBe(8);
    expect(effectiveScore(8, true, { ...policy, latePolicy: "accepted" })).toBe(
      8,
    );
  });

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

  it("totals rubric points and rejects points above a criterion", () => {
    const rubric = [
      { id: base.id, title: "A", description: "", maxPoints: 6 },
      { id: base.classId, title: "B", description: "", maxPoints: 4 },
    ];
    expect(
      rubricTotal(rubric, [
        { criterionId: base.id, points: 5 },
        { criterionId: base.classId, points: 4 },
      ]),
    ).toBe(9);
    expect(
      rubricTotal(rubric, [
        { criterionId: base.id, points: 7 },
        { criterionId: base.classId, points: 4 },
      ]),
    ).toBeNull();
    expect(
      rubricTotal(rubric, [{ criterionId: base.id, points: 5 }]),
    ).toBeNull();
    expect(rubricTotal([], [])).toBeNull();
  });
});
