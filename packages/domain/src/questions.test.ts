import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ContentDocument, ContentNode } from "./content";
import type { FormQuestion } from "./questions";

import { lessonBlockSchema } from "./learning";
import { questionNode } from "./lesson-content";
import { translatedContent } from "./lesson-translation";
import {
  answerText,
  formDocument,
  formIssue,
  formQuestions,
  formResponse,
  formValue,
  readFormAnswers,
} from "./questions";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const asked = { points: 0, hints: [], explanation: "", tries: null };

const heard: FormQuestion = {
  ...asked,
  id: id(1),
  type: "choice",
  prompt: "How did you hear about us?",
  options: [
    { id: id(11), text: "A friend", feedback: "" },
    { id: id(12), text: "The press", feedback: "" },
  ],
  correctOptionIds: [],
  multiple: false,
  shuffle: false,
};
const start: FormQuestion = {
  ...asked,
  id: id(2),
  type: "text",
  prompt: "Start",
  date: true,
  answers: [],
  caseSensitive: false,
  closeEnough: false,
  tehMarbuta: true,
};
const children: FormQuestion = {
  ...asked,
  id: id(3),
  type: "number",
  prompt: "Children",
  mode: "exact",
  value: 0,
  tolerance: 0,
  percent: false,
  min: 0,
  max: 0,
};
const more: FormQuestion = {
  ...asked,
  id: id(4),
  type: "written",
  prompt: "Anything else?",
  hints: ["Interests, languages at home."],
  required: true,
  wordLimit: null,
};

const withNode = (
  document: ContentDocument,
  node: ContentNode,
): ContentDocument => ({
  root: {
    ...document.root,
    children: [...(document.root.children ?? []), node],
  },
});

describe("a form's questions", () => {
  it("are question blocks, read back as they were written", () => {
    const document = formDocument([heard, start, children, more]);
    expect(formQuestions(document)).toEqual([heard, start, children, more]);
  });

  it("leave out a key a block was given, since a form marks nothing", () => {
    const keyed = { ...heard, points: 2, correctOptionIds: [id(11)] };
    const node = questionNode(keyed);
    if (!node) throw new Error("no node");
    const [read] = formQuestions(withNode(formDocument([]), node));
    expect(read).toMatchObject({ id: heard.id, correctOptionIds: [] });
    // The same block, marked, needs its key, as a lesson or quiz does.
    expect(v.safeParse(lessonBlockSchema, heard).success).toBe(false);
    expect(v.safeParse(lessonBlockSchema, keyed).success).toBe(true);
  });

  it("do not ask a question with no words, which holds nothing up", () => {
    const document = formDocument([heard, { ...more, prompt: "" }]);
    expect(formQuestions(document).map((question) => question.id)).toEqual([
      heard.id,
    ]);
    expect(formIssue(document)).toBeNull();
  });

  it("stop a form for a question unfinished, a kind a form does not ask, or a file", () => {
    expect(
      formIssue(formDocument([{ ...heard, options: heard.options.slice(1) }])),
    ).toBe("unfinished");
    const ordering = questionNode({
      ...asked,
      id: id(5),
      type: "ordering",
      prompt: "Order them",
      items: [
        { id: id(51), text: "One" },
        { id: id(52), text: "Two" },
      ],
      scoring: "all",
    });
    if (!ordering) throw new Error("no node");
    expect(formIssue(withNode(formDocument([heard]), ordering))).toBe("kind");
    expect(
      formIssue(
        withNode(formDocument([]), { type: "gate", version: 1 } as const),
      ),
    ).toBe("kind");
    expect(
      formIssue(
        withNode(formDocument([]), {
          type: "image",
          version: 1,
          fileId: id(6),
          alt: "A picture",
        } as const),
      ),
    ).toBe("files");
  });

  it("read in the translation's words, asking what the original asks", () => {
    const original = formDocument([heard, more]);
    const translation = formDocument([
      {
        ...heard,
        prompt: "كيف عرفتم بنا؟",
        options: [
          { id: id(11), text: "صديق", feedback: "" },
          { id: id(12), text: "الصحافة", feedback: "" },
        ],
      },
      { ...more, prompt: "شيء آخر؟", hints: ["الاهتمامات واللغات في البيت."] },
    ]);
    const read = formQuestions(translatedContent(original, translation));
    expect(read.map((question) => question.prompt)).toEqual([
      "كيف عرفتم بنا؟",
      "شيء آخر؟",
    ]);
    expect(read[1]?.hints).toEqual(["الاهتمامات واللغات في البيت."]);
    // A translation that changes what is asked reads as the original.
    const changed = formDocument([{ ...heard, multiple: true }]);
    expect(formQuestions(translatedContent(original, changed))[0]?.prompt).toBe(
      heard.prompt,
    );
  });
});

describe("a family's answers", () => {
  const questions = [heard, start, children, more];

  it("are kept as responses with the words the family read", () => {
    const read = readFormAnswers(questions, {
      [heard.id]: { type: "choice", optionIds: [id(12)] },
      [start.id]: { type: "text", text: "2027-09-01" },
      [children.id]: { type: "number", text: "٣" },
      [more.id]: { type: "written", text: "Loves building." },
      [id(9)]: { type: "text", text: "not asked" },
    });
    expect(read).toEqual({
      ok: true,
      answers: [
        {
          id: heard.id,
          kind: "choice",
          prompt: heard.prompt,
          response: { type: "choice", optionIds: [id(12)] },
          text: "The press",
        },
        {
          id: start.id,
          kind: "text",
          prompt: "Start",
          response: { type: "text", text: "2027-09-01" },
          text: "2027-09-01",
          date: true,
        },
        {
          id: children.id,
          kind: "number",
          prompt: "Children",
          response: { type: "number", text: "٣" },
          text: "٣",
        },
        {
          id: more.id,
          kind: "written",
          prompt: more.prompt,
          response: { type: "written", text: "Loves building." },
          text: "Loves building.",
        },
      ],
    });
  });

  it("refuse an option the question does not offer, a day that does not exist, or a number that does not read", () => {
    const answered = { [more.id]: { type: "written", text: "Yes" } };
    expect(
      readFormAnswers(questions, {
        ...answered,
        [heard.id]: { type: "choice", optionIds: [id(99)] },
      }),
    ).toEqual({ ok: false, questionId: heard.id, code: "invalid" });
    expect(
      readFormAnswers(questions, {
        ...answered,
        [start.id]: { type: "text", text: "2027-02-29" },
      }),
    ).toEqual({ ok: false, questionId: start.id, code: "invalid" });
    expect(
      readFormAnswers(questions, {
        ...answered,
        [children.id]: { type: "number", text: "three" },
      }),
    ).toEqual({ ok: false, questionId: children.id, code: "invalid" });
    expect(
      readFormAnswers(questions, {
        ...answered,
        [heard.id]: { type: "text", text: "A friend" },
      }),
    ).toEqual({ ok: false, questionId: heard.id, code: "invalid" });
    expect(
      readFormAnswers([heard], {
        [heard.id]: { type: "choice", optionIds: [id(11), id(12)] },
      }),
    ).toEqual({ ok: false, questionId: heard.id, code: "invalid" });
  });

  it("ask for a required answer and let an optional one be skipped", () => {
    expect(
      readFormAnswers(questions, { [more.id]: { type: "written", text: " " } }),
    ).toEqual({ ok: false, questionId: more.id, code: "required" });
    expect(
      readFormAnswers(questions, {
        [more.id]: { type: "written", text: "Yes" },
      }),
    ).toMatchObject({ ok: true, answers: [{ id: more.id, text: "Yes" }] });
  });

  it("take several options where a choice takes several, named in the form's order", () => {
    const several = { ...heard, multiple: true };
    const read = readFormAnswers([several], {
      [heard.id]: { type: "choice", optionIds: [id(12), id(11)] },
    });
    expect(read).toMatchObject({
      ok: true,
      answers: [{ text: "A friend, The press" }],
    });
  });

  it("go between a form's inputs and the responses they hold", () => {
    expect(formResponse(heard, [id(11)])).toEqual({
      type: "choice",
      optionIds: [id(11)],
    });
    expect(formResponse(start, "2027-09-01")).toEqual({
      type: "text",
      text: "2027-09-01",
    });
    expect(formResponse(more, "  ")).toBeUndefined();
    expect(formValue(heard, { type: "choice", optionIds: [id(12)] })).toEqual([
      id(12),
    ]);
    expect(formValue(more, { type: "text", text: "wrong kind" })).toEqual([]);
    expect(answerText(children, { type: "number", text: "12" })).toBe("12");
  });
});
