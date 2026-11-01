import { describe, expect, it } from "vitest";

import type { FormQuestion } from "./enquiries";

import {
  fillReply,
  nextStates,
  optionsOf,
  questionComplete,
  readAnswers,
  responseMinutes,
} from "./enquiries";

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

describe("reply templates", () => {
  it("fill the family's and the school's names in either language", () => {
    const fields = {
      name: "Salama Ashoush",
      child: "Yusuf",
      school: "Northwind",
      sender: "Office",
    };
    const english = fillReply("information", "en", fields);
    expect(english.subject).toBe("A little more about Yusuf");
    expect(english.body).toContain("Dear Salama Ashoush,");
    expect(english.body).toContain("Office\nNorthwind");
    const arabic = fillReply("visit", "ar", { ...fields, child: "" });
    expect(arabic.subject).toBe("زيارة Northwind");
    expect(arabic.body).not.toMatch(/\{\w+\}/);
    expect(
      fillReply("information", "en", { ...fields, child: "" }).subject,
    ).toBe("A little more about your child");
  });
});
