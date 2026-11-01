import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { AdmissionQuestion } from "./admissions";

import {
  APPLICATION_STATES,
  ageFit,
  ageInMonths,
  applicationReference,
  canMove,
  intakeWindow,
  nextApplicationStates,
  nextItemStates,
  NO_MATCHES,
  prioritiesFound,
  prioritiesMet,
  questionIn,
  questionReady,
  readApplicationAnswers,
  saveIntakeSchema,
  suggestedAges,
  suggestedCutoff,
} from "./admissions";
import { reviewDueOn } from "./privacy";

const question = (more: Partial<AdmissionQuestion>): AdmissionQuestion => ({
  id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d01",
  answer: "choice",
  required: "required",
  labelEn: "Which bus route?",
  labelAr: "أي خط حافلة؟",
  hintEn: "",
  hintAr: "",
  optionsEn: "Maadi\nZamalek",
  optionsAr: "المعادي\nالزمالك",
  ...more,
});

describe("an application's states", () => {
  it("lets the family send or withdraw a draft and nothing else", () => {
    expect(nextApplicationStates("draft", "family")).toEqual([
      "submitted",
      "withdrawn",
    ]);
    expect(nextApplicationStates("draft", "office")).toEqual([]);
  });

  it("puts reading a sent application in the office's hands", () => {
    expect(canMove("submitted", "in_review", "office")).toBe(true);
    expect(canMove("submitted", "in_review", "family")).toBe(false);
    expect(canMove("in_review", "withdrawn", "family")).toBe(true);
  });

  it("knows every state, and an ended one goes nowhere", () => {
    expect(APPLICATION_STATES).toContain("waitlisted");
    expect(APPLICATION_STATES).toContain("deferred");
    for (const state of [
      "withdrawn",
      "declined_by_school",
      "enrolled",
    ] as const)
      expect(nextApplicationStates(state, "office")).toEqual([]);
  });

  it("moves a checklist step on and back without skipping its check", () => {
    expect(nextItemStates("pending")).toEqual(["received", "waived"]);
    expect(nextItemStates("received")).toContain("verified");
    expect(nextItemStates("pending")).not.toContain("verified");
  });
});

describe("ages on the cut-off day", () => {
  it("counts whole months, a month short until the day comes round", () => {
    expect(ageInMonths("2022-10-01", "2026-10-01")).toBe(48);
    expect(ageInMonths("2022-10-02", "2026-10-01")).toBe(47);
    expect(ageInMonths("2020-02-29", "2026-10-01")).toBe(79);
  });

  it("holds Egypt's KG1 range of four to five years and eleven months", () => {
    const range = { ...suggestedAges("kg1"), cutoffOn: "2027-10-01" };
    expect(ageFit(range, "2023-10-01")).toBe("fits");
    expect(ageFit(range, "2023-10-02")).toBe("young");
    expect(ageFit(range, "2021-10-01")).toBe("old");
    expect(ageFit(range, "2021-10-02")).toBe("fits");
    expect(ageFit(range, null)).toBe("unknown");
  });

  it("starts grade one at six and each grade after a year later", () => {
    expect(suggestedAges("grade_1").minMonths).toBe(72);
    expect(suggestedAges("grade_4").minMonths).toBe(108);
    expect(suggestedAges("graduate")).toEqual({
      minMonths: null,
      maxMonths: null,
    });
  });

  it("counts on 1 October in Egypt and on the first day elsewhere", () => {
    expect(suggestedCutoff("2027-09-05", "EG")).toBe("2027-10-01");
    expect(suggestedCutoff("2027-08-28", "AE")).toBe("2027-08-28");
  });
});

describe("an intake", () => {
  it("is open from its first day to its last, both included", () => {
    const intake = { opensOn: "2026-11-01", closesOn: "2027-03-31" };
    expect(intakeWindow(intake, "2026-10-31")).toBe("upcoming");
    expect(intakeWindow(intake, "2026-11-01")).toBe("open");
    expect(intakeWindow(intake, "2027-03-31")).toBe("open");
    expect(intakeWindow(intake, "2027-04-01")).toBe("closed");
  });

  it("refuses a close before its opening, a range upside down and a rule twice", () => {
    const base = {
      expectedVersion: 0,
      schoolYearId: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d10",
      gradeId: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d11",
      opensOn: "2026-11-01",
      closesOn: "2027-03-31",
      capacity: 40,
      formId: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d12",
      checklist: [],
      currency: "EGP",
      fees: [{ kind: "application", amount: 1500 }],
      decisionsOn: "",
      offerDays: 14,
      ageCutoffOn: "2027-10-01",
      minAgeMonths: 48,
      maxAgeMonths: 71,
      priorities: ["sibling", "staff_child"],
    };
    expect(v.safeParse(saveIntakeSchema, base).success).toBe(true);
    const issue = (more: object) =>
      v.safeParse(saveIntakeSchema, { ...base, ...more }).issues?.[0]?.message;
    expect(issue({ closesOn: "2026-10-01" })).toBe("intake.dates");
    expect(issue({ minAgeMonths: 80 })).toBe("intake.ages");
    expect(issue({ priorities: ["sibling", "sibling"] })).toBe(
      "intake.priorities",
    );
    expect(issue({ fees: [{ kind: "application", amount: 10.005 }] })).toBe(
      "fee.amount",
    );
  });

  it("ranks the rules an applicant meets in the intake's order", () => {
    const met = prioritiesFound(
      {
        ...NO_MATCHES,
        staffParent: true,
        siblings: [{ id: "s", nameEn: "Sara", nameAr: null }],
      },
      true,
    );
    expect(
      prioritiesMet(["additional_needs", "sibling", "returning_student"], met),
    ).toEqual(["additional_needs", "sibling"]);
  });

  it("numbers applications by year of entry", () => {
    expect(applicationReference(2027, 42)).toBe("2027-0042");
  });
});

describe("the school's own questions", () => {
  it("asks in the family's language and borrows the other's words when one is blank", () => {
    expect(questionIn(question({}), "ar").label).toBe("أي خط حافلة؟");
    expect(questionIn(question({ labelAr: "" }), "ar").label).toBe(
      "Which bus route?",
    );
  });

  it("checks a choice against the options in the language the family read", () => {
    const read = readApplicationAnswers([question({})], "ar", {
      [question({}).id]: "الزمالك",
    });
    expect(read).toEqual({
      ok: true,
      answers: [
        {
          id: question({}).id,
          label: "أي خط حافلة؟",
          kind: "choice",
          value: "الزمالك",
        },
      ],
    });
    expect(
      readApplicationAnswers([question({})], "en", {
        [question({}).id]: "الزمالك",
      }).ok,
    ).toBe(false);
  });

  it("is ready once worded, and a choice once each language has the same options", () => {
    expect(questionReady(question({}))).toBe(true);
    expect(questionReady(question({ optionsAr: "المعادي" }))).toBe(false);
    expect(questionReady(question({ labelEn: "", labelAr: "" }))).toBe(false);
  });
});

describe("keeping an unsuccessful application", () => {
  it("is due for review the school's months after the intake closed", () => {
    const rules = {
      studentRule: null,
      studentValue: null,
      staffYears: null,
      applicantMonths: 12,
    };
    expect(
      reviewDueOn(rules, {
        kind: "applicant",
        leftOn: "2027-03-31",
        birthDate: null,
      }),
    ).toBe("2028-03-31");
    expect(
      reviewDueOn(
        { ...rules, applicantMonths: null },
        { kind: "applicant", leftOn: "2027-03-31", birthDate: null },
      ),
    ).toBeNull();
  });
});
