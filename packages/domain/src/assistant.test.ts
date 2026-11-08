import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { QuestionProposal } from "./assistant";
import type { ContentDocument, ContentNode } from "./content";

import {
  askedPrompts,
  holdsStudentWork,
  nameGuard,
  paragraphsOf,
  questionOfProposal,
  readProposal,
  StreamedItems,
  teacherWords,
  translationUnits,
  withTranslations,
} from "./assistant";
import { contentDocumentSchema } from "./content";
import { lessonOfContent } from "./lesson-content";

const run = (text: string, format = 0): ContentNode => ({
  type: "text",
  version: 1,
  text,
  format,
});

const paragraph = (...children: ContentNode[]): ContentNode => ({
  type: "paragraph",
  version: 1,
  children,
});

const document = (...children: ContentNode[]): ContentDocument => ({
  root: { type: "root", version: 1, children },
});

const proposal = (change: Partial<QuestionProposal>): QuestionProposal => ({
  kind: "choice",
  prompt: "What do plants need to make food?",
  options: [],
  answers: [],
  items: [],
  pairs: [],
  passage: "",
  explanation: "",
  ...change,
});

const choice = questionOfProposal(
  proposal({
    explanation: "Light drives photosynthesis.",
    options: [
      { text: "Light", correct: true },
      { text: "Darkness", correct: false },
    ],
  }),
);
const typed = questionOfProposal(
  proposal({
    kind: "text",
    prompt: "Name the green pigment.",
    answers: ["chlorophyll"],
  }),
);

describe("what a teacher's document sends", () => {
  it("is the words of its text blocks, without mentions, files, pictures or questions", () => {
    if (!choice) throw new Error("no question");
    const words = teacherWords(
      document(
        { type: "heading", version: 1, tag: "h2", children: [run("Plants")] },
        paragraph(
          run("Ask "),
          {
            type: "mention",
            version: 1,
            mention: { kind: "person", id: "u1", label: "Omar Haddad" },
          },
          run(" about leaves."),
        ),
        {
          type: "image",
          version: 1,
          fileId: "f1",
          alt: "Omar Haddad holding a leaf",
        },
        {
          type: "file",
          version: 1,
          fileId: "f2",
          name: "omar-report.pdf",
        },
        choice,
        {
          type: "list",
          version: 1,
          listType: "bullet",
          tag: "ul",
          children: [
            {
              type: "listitem",
              version: 1,
              children: [
                run("Roots"),
                {
                  type: "list",
                  version: 1,
                  listType: "bullet",
                  tag: "ul",
                  children: [
                    { type: "listitem", version: 1, children: [run("Hairs")] },
                  ],
                },
              ],
            },
          ],
        },
      ),
    );
    expect(words).toEqual(["Plants", "Ask  about leaves.", "Roots", "Hairs"]);
    expect(JSON.stringify(words)).not.toMatch(/Omar|f1|f2|Light|omar/);
  });

  it("lists the prompts its questions already ask", () => {
    if (!choice) throw new Error("no question");
    expect(askedPrompts(document(paragraph(run("x")), choice))).toEqual([
      "What do plants need to make food?",
    ]);
  });

  it("refuses work that declares a student's use of AI", () => {
    expect(holdsStudentWork(document(paragraph(run("Essay"))))).toBe(false);
    expect(
      holdsStudentWork(
        document(paragraph(run("Essay")), { type: "ai-use", version: 1 }),
      ),
    ).toBe(true);
  });
});

describe("names kept from the provider", () => {
  const guard = nameGuard(["Omar Haddad", "عمر حداد", "Al"]);

  it("hides each name as a token and puts it back", () => {
    const hidden = guard.hide("Well done, omar  haddad, and عمر حداد.");
    expect(hidden).not.toMatch(/omar|haddad|عمر|حداد/i);
    expect(guard.restore(hidden)).toBe("Well done, Omar Haddad, and عمر حداد.");
  });

  it("leaves a name inside another word alone", () => {
    expect(guard.hide("Algebra and Alps")).toBe("Algebra and Alps");
  });
});

const original = (): ContentDocument =>
  document(
    paragraph(run("Paris", 1), run(" is the capital of France.")),
    ...(typed ? [typed] : []),
  );

describe("a document translated passage by passage", () => {
  it("sends formatted runs tagged, prompts, and never the answer key", () => {
    const units = translationUnits(original());
    const texts = units.map((unit) => unit.text);
    expect(texts).toContain(
      "<t0>Paris</t0><t1> is the capital of France.</t1>",
    );
    expect(texts).toContain("Name the green pigment.");
    expect(texts.join(" ")).not.toContain("chlorophyll");
  });

  it("puts each translation back with the formatting its parts had", () => {
    const source = original();
    const units = translationUnits(source);
    const translated = withTranslations(
      source,
      units,
      new Map(
        units.map((unit, index) => [
          index,
          unit.text.startsWith("<t0>")
            ? "<t1>عاصمة فرنسا هي </t1><t0>باريس</t0>"
            : "سمِّ الصبغة الخضراء.",
        ]),
      ),
    );
    expect(v.safeParse(contentDocumentSchema, translated).success).toBe(true);
    const [first] = translated.root.children ?? [];
    expect(first?.children).toEqual([run("عاصمة فرنسا هي "), run("باريس", 1)]);
    const [, question] = lessonOfContent(translated).blocks;
    expect(question).toMatchObject({
      type: "text",
      prompt: "سمِّ الصبغة الخضراء.",
      answers: ["chlorophyll"],
    });
    expect(source.root.children?.[0]?.children?.[0]?.text).toBe("Paris");
  });
});

describe("questions proposed by the model", () => {
  it("become blocks of their existing kinds", () => {
    const kinds = [
      choice,
      typed,
      questionOfProposal(
        proposal({
          kind: "multiple",
          options: [
            { text: "Light", correct: true },
            { text: "Water", correct: true },
            { text: "Sand", correct: false },
          ],
        }),
      ),
      questionOfProposal(proposal({ kind: "written" })),
      questionOfProposal(
        proposal({ kind: "ordering", items: ["Seed", "Shoot", "Plant"] }),
      ),
      questionOfProposal(
        proposal({
          kind: "matching",
          pairs: [
            { prompt: "Root", answer: "Takes in water" },
            { prompt: "Leaf", answer: "Makes food" },
          ],
        }),
      ),
      questionOfProposal(
        proposal({
          kind: "gaps",
          passage:
            "Plants make food by [[photosynthesis]] in their [[leaves]].",
        }),
      ),
    ];
    expect(kinds.every(Boolean)).toBe(true);
    const blocks = lessonOfContent(
      document(...kinds.filter((node): node is ContentNode => node !== null)),
    ).blocks;
    expect(blocks.map((block) => block.type)).toEqual([
      "choice",
      "text",
      "choice",
      "written",
      "ordering",
      "matching",
      "gaps",
    ]);
    expect(blocks[6]).toMatchObject({
      segments: [
        { type: "text", text: "Plants make food by " },
        { type: "gap", answers: ["photosynthesis"] },
        { type: "text", text: " in their " },
        { type: "gap", answers: ["leaves"] },
        { type: "text", text: "." },
      ],
    });
  });

  it("are dropped when they would not make a question", () => {
    expect(
      questionOfProposal(
        proposal({
          options: [
            { text: "Light", correct: true },
            { text: "Water", correct: true },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      questionOfProposal(proposal({ kind: "text", answers: [] })),
    ).toBeNull();
    expect(readProposal({ kind: "essay" })).toBeNull();
  });

  it("are handed over one by one as the answer streams in", () => {
    const items = new StreamedItems("questions");
    const whole = JSON.stringify({
      questions: [
        proposal({ prompt: 'A "quoted" {brace}' }),
        proposal({ prompt: "Second" }),
      ],
    });
    const seen: unknown[] = [];
    for (let at = 0; at < whole.length; at += 7)
      seen.push(...items.push(whole.slice(at, at + 7)));
    expect(seen.map((item) => readProposal(item)?.prompt)).toEqual([
      'A "quoted" {brace}',
      "Second",
    ]);
  });
});

describe("a rewritten text", () => {
  it("reads as the paragraphs it was written in", () => {
    expect(paragraphsOf("One line\nwrapped.\n\n\nTwo.\n")).toEqual([
      "One line wrapped.",
      "Two.",
    ]);
  });
});
