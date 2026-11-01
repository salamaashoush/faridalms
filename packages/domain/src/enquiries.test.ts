import { describe, expect, it } from "vitest";

import type { FormQuestion } from "./enquiries";

import { contentPlainText } from "./content";
import { fillFields, plainContent } from "./content-conversion";
import {
  conversationSubject,
  nextStates,
  optionsOf,
  questionComplete,
  readAnswers,
  responseMinutes,
  submissionText,
} from "./enquiries";
import { BUILTIN_MESSAGE_TEMPLATES, messageFields } from "./templates";

const question = (more: Partial<FormQuestion>): FormQuestion => ({
  id: "q1",
  label: "How did you hear about us?",
  hint: "",
  answer: "short",
  required: "optional",
  options: "",
  ...more,
});

describe("an enquiry's states", () => {
  it("moves open work on, keeps a converted one once linked, and reopens where it left off", () => {
    expect(
      nextStates({ state: "open", responded: false, linked: false }),
    ).toEqual(["in_progress", "converted", "closed"]);
    expect(
      nextStates({ state: "in_progress", responded: true, linked: false }),
    ).toEqual(["converted", "closed"]);
    expect(
      nextStates({ state: "converted", responded: true, linked: false }),
    ).toEqual(["in_progress"]);
    expect(
      nextStates({ state: "converted", responded: true, linked: true }),
    ).toEqual([]);
    expect(
      nextStates({ state: "closed", responded: false, linked: false }),
    ).toEqual(["open"]);
    expect(
      nextStates({ state: "closed", responded: true, linked: false }),
    ).toEqual(["in_progress"]);
  });

  it("counts the first response in whole minutes", () => {
    expect(
      responseMinutes("2026-11-01T08:00:00.000Z", "2026-11-01T09:30:20.000Z"),
    ).toBe(90);
    expect(responseMinutes("2026-11-01T08:00:00.000Z", null)).toBeNull();
  });
});

describe("a form's own questions", () => {
  it("reads a choice's options one per line, without blanks or repeats", () => {
    expect(optionsOf(" A friend \n\nSocial media\nA friend\n")).toEqual([
      "A friend",
      "Social media",
    ]);
    expect(
      questionComplete(question({ answer: "choice", options: "One" })),
    ).toBe(false);
    expect(questionComplete(question({ label: " " }))).toBe(false);
  });

  it("keeps each answer in the question's words and checks it by kind", () => {
    const questions = [
      question({ id: "heard", answer: "choice", options: "Friend\nPress" }),
      question({ id: "start", label: "Start", answer: "date" }),
      question({ id: "count", label: "Children", answer: "number" }),
      question({ id: "unworded", label: "" }),
    ];
    expect(
      readAnswers(questions, {
        heard: "Press",
        start: "2027-09-01",
        count: "٣",
        unworded: "ignored",
        stranger: "ignored",
      }),
    ).toEqual({
      ok: true,
      answers: [
        {
          id: "heard",
          label: "How did you hear about us?",
          kind: "choice",
          value: "Press",
        },
        { id: "start", label: "Start", kind: "date", value: "2027-09-01" },
        { id: "count", label: "Children", kind: "number", value: "3" },
      ],
    });
    expect(readAnswers(questions, { heard: "Radio" })).toMatchObject({
      ok: false,
      questionId: "heard",
      code: "invalid",
    });
    expect(readAnswers(questions, { start: "2027-02-29" })).toMatchObject({
      ok: false,
      questionId: "start",
    });
    expect(readAnswers(questions, { count: "three" })).toMatchObject({
      ok: false,
      questionId: "count",
    });
  });

  it("asks for a required answer and lets an optional one be skipped", () => {
    const questions = [
      question({ id: "need", required: "required" }),
      question({ id: "maybe" }),
    ];
    expect(readAnswers(questions, { need: "  " })).toEqual({
      ok: false,
      questionId: "need",
      code: "required",
    });
    expect(readAnswers(questions, { need: "Yes" })).toMatchObject({
      ok: true,
      answers: [{ id: "need", value: "Yes" }],
    });
  });
});

const fill = (key: string, fields: { child: string }) => {
  const template = BUILTIN_MESSAGE_TEMPLATES.find((row) => row.key === key);
  if (!template) throw new Error(key);
  return contentPlainText(
    fillFields(
      plainContent(template.body),
      messageFields(template.locale, {
        name: "Salama Ashoush",
        school: "Northwind",
        sender: "Office",
        ...fields,
      }),
    ),
  );
};

describe("reply templates", () => {
  it("fill the family's and the school's names in either language", () => {
    const english = fill("enquiry_information_en", { child: "Yusuf" });
    expect(english).toContain("Dear Salama Ashoush,");
    expect(english).toContain("tell us Yusuf's date of birth");
    expect(english).toContain("Office\nNorthwind");
    const arabic = fill("enquiry_visit_ar", { child: "" });
    expect(arabic).toContain("مرحبًا Salama Ashoush،");
    expect(arabic).not.toMatch(/\{\w+\}/);
    expect(fill("enquiry_information_en", { child: "" })).toContain(
      "tell us your child's date of birth",
    );
  });

  it("come in both languages for every reply", () => {
    const keys = BUILTIN_MESSAGE_TEMPLATES.map((row) => row.key);
    for (const key of keys.filter((row) => row.endsWith("_en")))
      expect(keys).toContain(key.replace(/_en$/, "_ar"));
  });
});

describe("the enquiry's conversation", () => {
  it("is named in the family's language after what they asked", () => {
    expect(conversationSubject("visit", "en", "Northwind")).toBe(
      "Your visit to Northwind",
    );
    expect(conversationSubject("enquiry", "ar", "نورثويند")).toBe(
      "استفساركم لدى نورثويند",
    );
  });

  it("opens with the family's words, then their answers, or else their child", () => {
    const answers = [
      {
        id: "q1",
        label: "How did you hear about us?",
        kind: "choice" as const,
        value: "A friend",
      },
    ];
    expect(
      submissionText({
        message: "Is there a place in grade 2?",
        answers,
        childName: "Yusuf",
        childYear: "",
      }),
    ).toBe(
      "Is there a place in grade 2?\n\nHow did you hear about us?: A friend",
    );
    expect(
      submissionText({
        message: "",
        answers: [],
        childName: "Yusuf",
        childYear: "Grade 2",
      }),
    ).toBe("Yusuf, Grade 2");
  });
});
