import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { FormQuestion } from "./questions";

import {
  applyAsSchema,
  admissionsYear,
  ageFit,
  ageInMonths,
  APPLICATION_STATES,
  applicationReference,
  BUILTIN_LETTERS,
  canMove,
  familyState,
  fillLetter,
  renameLetterField,
  intakeWindow,
  LETTER_FIELDS,
  moveDecides,
  nextApplicationStates,
  nextItemStates,
  NO_MATCHES,
  offerExpiresOn,
  placesLeft,
  prioritiesFound,
  prioritiesMet,
  formUnready,
  questionsIn,
  rankWaitlist,
  readApplicationAnswers,
  releaseDue,
  saveIntakeSchema,
  stageReached,
  suggestedAges,
  suggestedCutoff,
} from "./admissions";
import { plainContent } from "./content-conversion";
import { reviewDueOn } from "./privacy";
import { formDocument, formQuestions } from "./questions";

const route = (
  prompt: string,
  options: [string, string],
): Extract<FormQuestion, { type: "choice" }> => ({
  id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d01",
  type: "choice",
  prompt,
  points: 0,
  hints: [],
  explanation: "",
  tries: null,
  required: true,
  options: options.map((text, place) => ({
    id: `0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d1${place}`,
    text,
    feedback: "",
  })),
  correctOptionIds: [],
  multiple: false,
  shuffle: false,
});
const form = {
  primaryLocale: "en" as const,
  body: formDocument([route("Which bus route?", ["Maadi", "Zamalek"])]),
  translation: formDocument([route("أي خط حافلة؟", ["المعادي", "الزمالك"])]),
};

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

  it("keeps deciding, offering and enrolling to those who decide", () => {
    expect(nextApplicationStates("in_review", "office")).toContain("decided");
    expect(moveDecides("in_review", "decided")).toBe(true);
    expect(moveDecides("decided", "offered")).toBe(true);
    expect(moveDecides("accepted", "enrolled")).toBe(true);
    expect(moveDecides("in_review", "withdrawn")).toBe(false);
    expect(moveDecides("offered", "accepted")).toBe(false);
  });

  it("lets the family answer an offer and the clock let it lapse, and nobody else", () => {
    expect(nextApplicationStates("offered", "family")).toEqual([
      "accepted",
      "offer_declined",
    ]);
    expect(canMove("offered", "offer_expired", "clock")).toBe(true);
    expect(canMove("offered", "offer_expired", "office")).toBe(false);
    expect(canMove("decided", "offered", "clock")).toBe(true);
    expect(canMove("decided", "offered", "family")).toBe(false);
  });

  it("shows the family a decision not yet released as still under review", () => {
    expect(familyState("decided")).toBe("in_review");
    expect(familyState("offered")).toBe("offered");
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
      titleEn: "KG1, 2027–2028",
      startsOn: "2027-09-05",
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
    expect(issue({ titleEn: " " })).toBe("validation.name_required");
    expect(issue({ minAgeMonths: 80 })).toBe("intake.ages");
    expect(issue({ priorities: ["sibling", "sibling"] })).toBe(
      "intake.priorities",
    );
    expect(issue({ fees: [{ kind: "application", amount: 10.005 }] })).toBe(
      "fee.amount",
    );
    for (const amount of [19.99, 1.15, 0.29, 0.07, 4.35, 99_999_999.99])
      expect(
        issue({ fees: [{ kind: "application", amount }] }),
      ).toBeUndefined();
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
  it("asks in the family's language, the original deciding what is asked", () => {
    expect(formQuestions(questionsIn(form, "ar"))[0]?.prompt).toBe(
      "أي خط حافلة؟",
    );
    expect(formQuestions(questionsIn(form, "en"))[0]?.prompt).toBe(
      "Which bus route?",
    );
    expect(
      formQuestions(questionsIn({ ...form, translation: null }, "ar"))[0]
        ?.prompt,
    ).toBe("Which bus route?");
  });

  it("keeps the option chosen by its id, in the words the family read", () => {
    const zamalek = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d11";
    const answer = { type: "choice", optionIds: [zamalek] };
    const id = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d01";
    expect(readApplicationAnswers(form, "ar", { [id]: answer })).toMatchObject({
      ok: true,
      answers: [{ prompt: "أي خط حافلة؟", text: "الزمالك" }],
    });
    expect(readApplicationAnswers(form, "en", { [id]: answer })).toMatchObject({
      ok: true,
      answers: [{ prompt: "Which bus route?", text: "Zamalek" }],
    });
    expect(readApplicationAnswers(form, "en", {})).toMatchObject({
      ok: false,
      code: "required",
    });
  });

  it("is ready once every question with words is finished, in either language", () => {
    expect(formUnready(form)).toBeNull();
    const single = route("Which bus route?", ["Maadi", "Zamalek"]);
    const unfinished = {
      ...form,
      translation: formDocument([
        { ...single, prompt: "أي خط؟", options: single.options.slice(0, 1) },
      ]),
    };
    expect(formUnready(unfinished)).toBe(single.id);
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

const entry = (
  id: string,
  priorities: ("sibling" | "staff_child")[],
  birthDate: string | null,
  submittedAt = "2027-01-01T00:00:00.000Z",
) => ({ id, priorities, birthDate, submittedAt });

describe("places and offers", () => {
  it("counts the seats less the offers accepted and those still open", () => {
    expect(placesLeft({ capacity: 24, accepted: 20, offered: 3 })).toBe(1);
    expect(placesLeft({ capacity: 2, accepted: 2, offered: 1 })).toBe(-1);
  });

  it("keeps an offer open for the intake's days and releases on its day", () => {
    expect(offerExpiresOn("2027-04-15", 14)).toBe("2027-04-29");
    expect(offerExpiresOn("2027-12-25", 10)).toBe("2028-01-04");
    expect(releaseDue({ decisionsOn: "2027-04-15" }, "2027-04-14")).toBe(false);
    expect(releaseDue({ decisionsOn: "2027-04-15" }, "2027-04-15")).toBe(true);
    expect(releaseDue({ decisionsOn: null }, "2099-01-01")).toBe(false);
  });

  it("ranks the waiting list by the intake's rules in order, then the older child, then who sent first", () => {
    const ranked = rankWaitlist(
      [
        entry("staff", ["staff_child"], "2022-01-01"),
        entry("young", [], "2022-06-01"),
        entry("sibling", ["sibling"], "2022-09-01"),
        entry("old", [], "2021-11-01"),
        entry("unknown", [], null),
        entry("late", [], "2021-11-01", "2027-02-01T00:00:00.000Z"),
        entry("both", ["sibling", "staff_child"], "2022-12-01"),
      ],
      ["sibling", "staff_child"],
    );
    expect(ranked.map((row) => row.id)).toEqual([
      "both",
      "sibling",
      "staff",
      "old",
      "late",
      "young",
      "unknown",
    ]);
  });
});

describe("letters", () => {
  const fields = {
    family: "Salama Ashoush",
    applicant: "Salama Ashoush",
    child: "Omar",
    intake: "KG1, 2027–2028",
    grade: "KG1",
    year: "2027–2028",
    school: "Northwind",
    reference: "2027-0042",
    expires: "29 April 2027",
  };

  it("fills every field wherever it is written and leaves unknown braces alone", () => {
    const letter = fillLetter(
      plainContent(
        "Dear {family},\n{child} joins {grade} in {year}. {unknown}",
      ),
      fields,
    );
    const text = JSON.stringify(letter);
    expect(text).toContain("Dear Salama Ashoush,");
    expect(text).toContain("Omar joins KG1 in 2027–2028.");
    expect(text).toContain("{unknown}");
  });

  it("writes the person who applied under the name the school knows them by, leaving the rest", () => {
    const letter = renameLetterField(
      plainContent("Dear {family},\n{child} joins {intake}."),
      "family",
      "applicant",
    );
    const text = JSON.stringify(letter);
    expect(text).toContain("Dear {applicant},");
    expect(text).not.toContain("{family}");
    expect(text).toContain("{child} joins {intake}.");
    expect(JSON.stringify(fillLetter(letter, fields))).toContain(
      "Dear Salama Ashoush,",
    );
  });

  it("starts every school with each phase's letter in both languages, using only known fields", () => {
    for (const kind of ["offer", "waitlist", "decline", "welcome"] as const)
      for (const locale of ["en", "ar"] as const)
        expect(
          BUILTIN_LETTERS.some(
            (letter) => letter.kind === kind && letter.locale === locale,
          ),
        ).toBe(true);
    for (const letter of BUILTIN_LETTERS)
      for (const [, name] of letter.body.matchAll(/\{([a-z]+)\}/g))
        expect(LETTER_FIELDS).toContain(name);
  });
});

describe("the funnel", () => {
  it("counts each application at the furthest stage it reached, an ending at the stage it ended from", () => {
    expect(stageReached(["submitted", "in_review"])).toBe("in_review");
    expect(
      stageReached([
        "submitted",
        "in_review",
        "decided",
        "offered",
        "offer_declined",
      ]),
    ).toBe("offered");
    expect(
      stageReached(["submitted", "in_review", "decided", "waitlisted"]),
    ).toBe("decided");
    expect(stageReached(["draft", "withdrawn"])).toBeNull();
  });
});

const year = (startsOn: string, lifecycle = "upcoming") => ({
  startsOn,
  lifecycle,
});

describe("admissionsYear", () => {
  const today = "2026-11-08";

  it("opens on the soonest upcoming year still ahead", () => {
    const next = year("2027-09-01");
    expect(
      admissionsYear(
        [year("2030-09-01"), next, year("2026-09-01", "current")],
        today,
      ),
    ).toBe(next);
  });

  it("passes over an upcoming year that has already begun", () => {
    const next = year("2027-09-01");
    expect(admissionsYear([next, year("2011-09-11")], today)).toBe(next);
  });

  it("falls back to the soonest upcoming year, then the latest", () => {
    const begun = year("2026-09-01");
    expect(admissionsYear([begun], today)).toBe(begun);
    const current = year("2026-09-01", "current");
    expect(admissionsYear([current], today)).toBe(current);
    expect(admissionsYear([], today)).toBeNull();
  });
});

describe("whom an application is for", () => {
  it("is the person themself or someone in their care, and nothing else", () => {
    expect(v.parse(applyAsSchema, { applyingFor: "self" })).toEqual({
      applyingFor: "self",
    });
    expect(v.parse(applyAsSchema, { applyingFor: "other" })).toEqual({
      applyingFor: "other",
    });
    expect(v.safeParse(applyAsSchema, { applyingFor: "both" }).success).toBe(
      false,
    );
    expect(v.safeParse(applyAsSchema, {}).success).toBe(false);
  });
});
