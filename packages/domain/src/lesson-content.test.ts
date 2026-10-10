import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { LessonDocument } from "./learning";

import {
  contentDocumentSchema,
  contentFileIds,
  contentPlainText,
  sameContent,
} from "./content";
import { plainContent } from "./content-conversion";
import {
  lessonDocumentSchema,
  markResponse,
  responseIssue,
  studentBlocks,
  videoStops,
} from "./learning";
import {
  briefWithQuiz,
  contentOfLesson,
  holdsQuestions,
  lessonOfContent,
  quizIntro,
  quizOfBrief,
  sameLesson,
} from "./lesson-content";

const lesson: LessonDocument = {
  version: 2,
  blocks: [
    {
      id: crypto.randomUUID(),
      type: "content",
      content: plainContent("Read the poem first."),
    },
    {
      id: crypto.randomUUID(),
      type: "media",
      fileId: "1e7c5d8f-9a2b-4c3d-8e4f-a5b6c7d8e9f0",
      name: "reading.mp3",
      mediaType: "audio/mpeg",
      sizeBytes: 48000,
      caption: "The poem read aloud",
      captionsFileId: null,
      captionsLang: "ar",
      transcript: "Line one.\nLine two.",
    },
    { id: crypto.randomUUID(), type: "gate", requires: "above" },
    {
      id: "7a1f6b1e-4a3b-4c8e-9d2a-1b2c3d4e5f60",
      type: "choice",
      prompt: "Which word is a verb?",
      points: 2,
      hints: ["It is something you do.", "You can do it with your legs."],
      explanation: "Run is an action.",
      tries: 2,
      options: [
        {
          id: "0b6f4c7e-8a1d-4b2c-9e3f-a1b2c3d4e5f6",
          text: "Run",
          feedback: "",
        },
        {
          id: "1c7a5d8f-9b2e-4c3d-8f4a-b2c3d4e5f6a7",
          text: "Table",
          feedback: "A table is a thing.",
        },
      ],
      correctOptionIds: ["0b6f4c7e-8a1d-4b2c-9e3f-a1b2c3d4e5f6"],
      multiple: false,
      shuffle: true,
    },
    {
      id: "2d8b6e9a-0c3f-4d4e-9a5b-c3d4e5f6a7b8",
      type: "text",
      prompt: "The capital of Egypt?",
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      answers: ["Cairo", "القاهرة"],
      caseSensitive: false,
      closeEnough: true,
      tehMarbuta: true,
    },
    {
      id: "4f0d8a1c-2e5b-4f6a-9c7d-e5f6a7b8c9d0",
      type: "number",
      prompt: "How many sides has a hexagon?",
      points: 1,
      hints: [],
      explanation: "",
      tries: 3,
      mode: "exact",
      value: 6,
      tolerance: 0,
      percent: false,
      min: 0,
      max: 0,
    },
    {
      id: "5a1e9b2d-3f6c-4a7b-8d8e-f6a7b8c9d0e1",
      type: "ordering",
      prompt: "Put the stages in order.",
      points: 2,
      hints: [],
      explanation: "",
      tries: null,
      items: [
        { id: "6b2f0c3e-4a7d-4b8c-9e9f-a7b8c9d0e1f2", text: "Egg" },
        { id: "7c3a1d4f-5b8e-4c9d-8f0a-b8c9d0e1f2a3", text: "Caterpillar" },
        { id: "8d4b2e5a-6c9f-4d0e-9a1b-c9d0e1f2a3b4", text: "Butterfly" },
      ],
      scoring: "neighbours",
    },
    {
      id: "9e5c3f6b-7d0a-4e1f-8b2c-d0e1f2a3b4c5",
      type: "matching",
      prompt: "Match each word to its meaning.",
      points: 3,
      hints: [],
      explanation: "",
      tries: null,
      pairs: [
        {
          id: "0f6d4a7c-8e1b-4f2a-9c3d-e1f2a3b4c5d6",
          prompt: "Big",
          answer: "Large",
        },
        {
          id: "1a7e5b8d-9f2c-4a3b-8d4e-f2a3b4c5d6e7",
          prompt: "Quick",
          answer: "Fast",
        },
      ],
      distractors: [
        { id: "2b8f6c9e-0a3d-4b4c-9e5f-a3b4c5d6e7f8", text: "Slow" },
      ],
    },
    {
      id: "3c9a7d0f-1b4e-4c5d-8f6a-b4c5d6e7f8a9",
      type: "sorting",
      prompt: "Sort the animals.",
      points: 2,
      hints: [],
      explanation: "",
      tries: null,
      groups: [
        { id: "4d0b8e1a-2c5f-4d6e-9a7b-c5d6e7f8a9b0", name: "Mammals" },
        { id: "5e1c9f2b-3d6a-4e7f-8b8c-d6e7f8a9b0c1", name: "Birds" },
      ],
      items: [
        {
          id: "6f2d0a3c-4e7b-4f8a-9c9d-e7f8a9b0c1d2",
          text: "Cat",
          groupId: "4d0b8e1a-2c5f-4d6e-9a7b-c5d6e7f8a9b0",
        },
        {
          id: "7a3e1b4d-5f8c-4a9b-8d0e-f8a9b0c1d2e3",
          text: "Eagle",
          groupId: "5e1c9f2b-3d6a-4e7f-8b8c-d6e7f8a9b0c1",
        },
      ],
    },
    {
      id: "8b4f2a5c-6d9e-4b0f-9c1a-e2f3a4b5c6d7",
      type: "gaps",
      prompt: "Fill in the gaps.",
      points: 2,
      hints: [],
      explanation: "",
      tries: null,
      segments: [
        { type: "text", text: "The capital of Egypt is " },
        {
          type: "gap",
          id: "9c5a3b6d-7e0f-4c1a-8d2b-f3a4b5c6d7e8",
          answers: ["Cairo", "القاهرة"],
          options: [],
        },
        { type: "text", text: ".\nIt stands on the " },
        {
          type: "gap",
          id: "0d6b4c7e-8f1a-4d2b-9e3c-a4b5c6d7e8f9",
          answers: ["Nile"],
          options: ["Nile", "Thames", "Seine"],
        },
        { type: "text", text: " river." },
      ],
      caseSensitive: false,
      closeEnough: true,
      tehMarbuta: true,
    },
    {
      id: "3e9c7f0b-1d4a-4e5f-8b6c-d4e5f6a7b8c9",
      type: "written",
      prompt: "Why does the poet repeat the last line?",
      points: 4,
      hints: [],
      explanation: "",
      tries: null,
      wordLimit: 150,
    },
  ],
};

const checks = (blocks: LessonDocument["blocks"]) =>
  blocks.filter((block) => !["content", "media", "gate"].includes(block.type));

describe("lessons written as one document", () => {
  it("keeps every question, its id and its key through the document", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const back = lessonOfContent(document);
    expect(v.safeParse(lessonDocumentSchema, back).success).toBe(true);
    expect(checks(back.blocks)).toEqual(checks(lesson.blocks));
    expect(back.blocks.map((block) => block.type).slice(0, 3)).toEqual([
      "content",
      "gate",
      "choice",
    ]);
    expect(document.root.children?.[1]).toMatchObject({
      type: "media",
      mime: "audio/mpeg",
      captionsLang: "ar",
      transcript: "Line one.\nLine two.",
    });
    const text = back.blocks.find((block) => block.type === "content");
    expect(
      text?.type === "content" ? contentPlainText(text.content) : "",
    ).toContain("Read the poem first.");
    expect(contentPlainText(document)).toContain("Line two.");
  });

  it("reads a question saved with one hint as its first hint", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    const saved = structuredClone(document);
    const question = saved.root.children?.find(
      (node) => node.type === "question",
    );
    if (!question) throw new Error("the lesson has no question");
    delete question.hints;
    question.hint = "It is something you do.";
    const back = lessonOfContent(saved);
    expect(back.blocks.find((block) => block.type === "choice")).toMatchObject({
      hints: ["It is something you do."],
    });
  });

  it("gives the text between questions the same id each time", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    const first = lessonOfContent(document).blocks[0]?.id;
    expect(first).toBe(lessonOfContent(document).blocks[0]?.id);
  });

  it("keeps the accepted answers out of searchable text", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    expect(contentPlainText(document)).not.toContain("Cairo");
    expect(contentPlainText(document)).not.toContain("Thames");
    expect(contentPlainText(document)).toContain("It stands on the");
    expect(contentPlainText(document)).toContain("The capital of Egypt?");
  });

  it("sees a lesson as unchanged whatever ids its blocks were given", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    const reopened = structuredClone(document);
    for (const [index, node] of (reopened.root.children ?? []).entries())
      node.$ = { id: `block${index}aa` };
    expect(sameLesson(document, reopened)).toBe(true);
    const edited = structuredClone(reopened);
    const first = edited.root.children?.[0]?.children?.[0];
    if (first) first.text = "Read the poem twice.";
    expect(sameLesson(document, edited)).toBe(false);
  });

  it("leaves out options and items still empty", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    const choice = document.root.children?.find(
      (node) => node.type === "question" && node.kind === "choice",
    );
    choice?.children?.push({
      type: "question-option",
      version: 1,
      format: "",
      indent: 0,
      direction: null,
      optionId: crypto.randomUUID(),
      children: [],
    });
    const block = lessonOfContent(document).blocks.find(
      (item) => item.type === "choice",
    );
    expect(block?.type === "choice" ? block.options : []).toHaveLength(2);
  });

  it("splits a quiz brief into the words students read first and the quiz", () => {
    const asked = { version: 2 as const, blocks: checks(lesson.blocks) };
    const brief = briefWithQuiz(plainContent("Read carefully."), asked);
    expect(holdsQuestions(brief)).toBe(true);
    expect(contentPlainText(quizIntro(brief))).toBe("Read carefully.");
    expect(JSON.stringify(quizIntro(brief))).not.toContain("Cairo");
    expect(checks(quizOfBrief(brief).blocks)).toEqual(asked.blocks);
    expect(quizOfBrief(plainContent("No questions yet.")).blocks).toEqual([]);
  });
});

const partId = (n: number) =>
  `0190a1b2-0000-7000-8000-0000000001${String(n).padStart(2, "0")}`;

describe("pictures on a question's parts", () => {
  const cat = "0190a1b2-0000-7000-8000-0000000000c1";
  const dog = "0190a1b2-0000-7000-8000-0000000000d1";
  const base = { points: 1, hints: [], explanation: "", tries: null };
  const pictured: LessonDocument = {
    version: 2,
    blocks: [
      {
        ...base,
        id: partId(1),
        type: "choice",
        prompt: "Which one says meow?",
        options: [
          {
            id: partId(2),
            text: "",
            picture: { fileId: cat, alt: "A cat" },
            feedback: "",
          },
          {
            id: partId(3),
            text: "Dog",
            picture: { fileId: dog, alt: "" },
            feedback: "",
          },
        ],
        correctOptionIds: [partId(2)],
        multiple: false,
        shuffle: false,
      },
      {
        ...base,
        id: partId(4),
        type: "matching",
        prompt: "Match each animal to its name.",
        pairs: [
          {
            id: partId(5),
            prompt: "",
            promptPicture: { fileId: cat, alt: "A cat" },
            answer: "Cat",
          },
          {
            id: partId(6),
            prompt: "",
            promptPicture: { fileId: dog, alt: "A dog" },
            answer: "Dog",
          },
        ],
        distractors: [],
      },
    ],
  };

  it("keeps each picture and its description through the document", () => {
    const document = contentOfLesson(pictured);
    if (!document) throw new Error("lesson could not become a document");
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const back = lessonOfContent(document);
    expect(v.safeParse(lessonDocumentSchema, back).success).toBe(true);
    expect(checks(back.blocks)).toEqual(checks(pictured.blocks));
  });

  it("refuses a part with neither words nor a described picture", () => {
    const [choice] = pictured.blocks;
    if (choice?.type !== "choice") throw new Error("choice expected");
    const unnamed: LessonDocument = {
      version: 2,
      blocks: [
        {
          ...choice,
          options: choice.options.map((option) => ({
            ...option,
            text: "",
            picture: option.picture ? { ...option.picture, alt: "" } : null,
          })),
        },
      ],
    };
    expect(v.safeParse(lessonDocumentSchema, unnamed).success).toBe(false);
  });
});

const voice = (n: number) =>
  `0190a1b2-0000-7000-8000-0000000002${String(n).padStart(2, "0")}`;

describe("narration recorded by the teacher", () => {
  const base = { points: 1, hints: [], explanation: "", tries: null };
  const narrated: LessonDocument = {
    version: 2,
    blocks: [
      {
        ...base,
        id: partId(10),
        type: "choice",
        prompt: "Which one starts with m?",
        narration: voice(1),
        narrationWords: [0, 400, 800, 1100, 1500],
        options: [
          { id: partId(11), text: "moon", narration: voice(2), feedback: "" },
          { id: partId(12), text: "sun", feedback: "" },
        ],
        correctOptionIds: [partId(11)],
        multiple: false,
        shuffle: false,
      },
      {
        ...base,
        id: partId(13),
        type: "matching",
        prompt: "Match the sounds.",
        pairs: [
          {
            id: partId(14),
            prompt: "m",
            promptNarration: voice(3),
            answer: "moon",
            answerNarration: voice(4),
          },
          { id: partId(15), prompt: "s", answer: "sun" },
        ],
        distractors: [{ id: partId(16), text: "cat", narration: voice(5) }],
      },
      {
        ...base,
        id: partId(17),
        type: "sorting",
        prompt: "Sort them.",
        groups: [
          { id: partId(18), name: "Flies", narration: voice(6) },
          { id: partId(19), name: "Swims" },
        ],
        items: [
          {
            id: partId(20),
            text: "bird",
            narration: voice(7),
            groupId: partId(18),
          },
          { id: partId(21), text: "fish", groupId: partId(19) },
        ],
      },
    ],
  };

  it("keeps every recording on its question and part through the document", () => {
    const document = contentOfLesson(narrated);
    if (!document) throw new Error("lesson could not become a document");
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const back = lessonOfContent(document);
    expect(v.safeParse(lessonDocumentSchema, back).success).toBe(true);
    expect(checks(back.blocks)).toEqual(checks(narrated.blocks));
    expect(document.root.children?.[0]?.$?.words).toEqual([
      0, 400, 800, 1100, 1500,
    ]);
    expect(contentFileIds(document).toSorted()).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map(voice),
    );
  });

  it("counts a new recording as a change, and a new block id as none", () => {
    const document = contentOfLesson(narrated);
    if (!document) throw new Error("lesson could not become a document");
    const [question, ...rest] = document.root.children ?? [];
    if (!question) throw new Error("question expected");
    const renamed = {
      root: {
        ...document.root,
        children: [
          { ...question, $: { ...question.$, id: "abcdefgh" } },
          ...rest,
        ],
      },
    };
    const revoiced = {
      root: {
        ...document.root,
        children: [{ ...question, $: { narration: voice(9) } }, ...rest],
      },
    };
    expect(sameContent(document, renamed)).toBe(true);
    expect(sameContent(document, revoiced)).toBe(false);
  });
});

describe("counting", () => {
  const base = { points: 1, hints: [], explanation: "", tries: null };
  const counting: LessonDocument = {
    version: 2,
    blocks: [
      {
        ...base,
        id: partId(30),
        type: "counting",
        prompt: "How many cats?",
        picture: { fileId: voice(1), alt: "A cat" },
        count: 7,
        mode: "count",
        layout: "frame",
        flashSeconds: 3,
      },
      {
        ...base,
        id: partId(31),
        type: "counting",
        prompt: "Put 6 counters in the frames.",
        picture: null,
        count: 6,
        mode: "make",
        layout: "scatter",
        flashSeconds: null,
      },
    ],
  };

  it("keeps what is counted, how many and how through the document", () => {
    const document = contentOfLesson(counting);
    if (!document) throw new Error("lesson could not become a document");
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const back = lessonOfContent(document);
    expect(v.safeParse(lessonDocumentSchema, back).success).toBe(true);
    expect(checks(back.blocks)).toEqual(checks(counting.blocks));
  });

  it("marks a count right only when it is the number shown", () => {
    const [shown] = counting.blocks;
    if (shown?.type !== "counting") throw new Error("counting expected");
    expect(markResponse(shown, { type: "counting", value: 7 })).toMatchObject({
      correct: true,
      fraction: 1,
    });
    expect(markResponse(shown, { type: "counting", value: 6 })).toMatchObject({
      correct: false,
      fraction: 0,
    });
  });
});

describe("memory pairs", () => {
  it("keeps a matching question played as memory pairs through the document", () => {
    const pairs: LessonDocument = {
      version: 2,
      blocks: [
        {
          id: partId(40),
          type: "matching",
          prompt: "Find the pairs.",
          points: 0,
          hints: [],
          explanation: "",
          tries: null,
          memory: true,
          pairs: [
            { id: partId(41), prompt: "Cat", answer: "Meow" },
            { id: partId(42), prompt: "Dog", answer: "Woof" },
          ],
          distractors: [],
        },
      ],
    };
    const document = contentOfLesson(pairs);
    if (!document) throw new Error("lesson could not become a document");
    expect(checks(lessonOfContent(document).blocks)).toEqual(
      checks(pairs.blocks),
    );
  });
});

describe("drawn and photographed answers", () => {
  const pictured: LessonDocument = {
    version: 2,
    blocks: (["drawing", "photo"] as const).map((answerWith, index) => ({
      id: partId(50 + index),
      type: "written",
      prompt: "Show me your house.",
      points: 0,
      hints: [],
      explanation: "",
      tries: null,
      wordLimit: null,
      answerWith,
    })),
  };

  it("keeps how a question is answered through the document", () => {
    const document = contentOfLesson(pictured);
    if (!document) throw new Error("lesson could not become a document");
    expect(checks(lessonOfContent(document).blocks)).toEqual(
      checks(pictured.blocks),
    );
  });

  it("takes a picture for a drawn answer and refuses words alone", () => {
    const [drawn] = pictured.blocks;
    if (drawn?.type !== "written") throw new Error("a written question");
    const picture = { fileId: partId(59) };
    expect(
      responseIssue(drawn, { type: "written", text: "", picture }),
    ).toBeNull();
    expect(responseIssue(drawn, { type: "written", text: "My house" })).toBe(
      "learning.response",
    );
    expect(
      responseIssue(
        { ...drawn, answerWith: null },
        { type: "written", text: "", picture },
      ),
    ).toBe("learning.response");
  });
});

describe("answers on video", () => {
  const filmed: LessonDocument = {
    version: 2,
    blocks: [
      {
        id: partId(56),
        type: "written",
        prompt: "Show us how you solved it.",
        points: 2,
        hints: [],
        explanation: "",
        tries: null,
        wordLimit: null,
        recordSeconds: 90,
        recordVideo: true,
      },
    ],
  };

  it("keeps a question answered on video through the document", () => {
    const document = contentOfLesson(filmed);
    if (!document) throw new Error("lesson could not become a document");
    expect(checks(lessonOfContent(document).blocks)).toEqual(
      checks(filmed.blocks),
    );
  });

  it("takes a video for it and refuses a recording that is only sound", () => {
    const [asked] = filmed.blocks;
    if (asked?.type !== "written") throw new Error("a written question");
    const recording = { fileId: partId(57), seconds: 40 };
    expect(
      responseIssue(asked, {
        type: "written",
        text: "",
        recording: { ...recording, video: true },
      }),
    ).toBeNull();
    expect(responseIssue(asked, { type: "written", text: "", recording })).toBe(
      "learning.response",
    );
    expect(
      responseIssue(
        { ...asked, recordVideo: false },
        { type: "written", text: "", recording: { ...recording, video: true } },
      ),
    ).toBe("learning.response");
  });
});

describe("find on a picture", () => {
  const find: LessonDocument = {
    version: 2,
    blocks: [
      {
        id: partId(60),
        type: "hotspot",
        prompt: "Find the two ducks.",
        points: 1,
        hints: [],
        explanation: "",
        tries: null,
        picture: { fileId: partId(61), alt: "A pond" },
        regions: [
          [0.1, 0.2, 0.2, 0.2],
          [0.6, 0.5, 0.2, 0.3],
        ],
      },
    ],
  };
  const [block] = find.blocks;
  if (block?.type !== "hotspot") throw new Error("a hotspot question");

  it("keeps the picture and its places through the document", () => {
    const document = contentOfLesson(find);
    if (!document) throw new Error("lesson could not become a document");
    expect(checks(lessonOfContent(document).blocks)).toEqual(
      checks(find.blocks),
    );
  });

  it("finds a place from a tap on it or just beside it", () => {
    expect(
      markResponse(block, {
        type: "hotspot",
        taps: [
          [0.15, 0.25],
          [0.82, 0.79],
        ],
      }),
    ).toMatchObject({ correct: true, fraction: 1 });
    expect(
      markResponse(block, { type: "hotspot", taps: [[0.2, 0.3]] }),
    ).toMatchObject({
      correct: false,
      parts: { "region-1": true, "region-2": false },
    });
  });

  it("counts a tap on nothing as a miss even when every place is found", () => {
    expect(
      markResponse(block, {
        type: "hotspot",
        taps: [
          [0.15, 0.25],
          [0.7, 0.6],
          [0.45, 0.05],
        ],
      }),
    ).toMatchObject({ correct: false });
  });

  it("is not ready without a picture and a place to find", () => {
    expect(
      v.safeParse(lessonDocumentSchema, {
        version: 2,
        blocks: [{ ...block, regions: [] }],
      }).success,
    ).toBe(false);
  });
});

describe("word builder", () => {
  const ship: LessonDocument = {
    version: 2,
    blocks: [
      {
        id: partId(50),
        type: "spelling",
        prompt: "Build the word ship.",
        points: 1,
        hints: [],
        explanation: "",
        tries: null,
        picture: null,
        tiles: ["sh", "i", "p"],
        extras: ["a", "t"],
      },
    ],
  };

  it("keeps the word's tiles and the extra ones through the document", () => {
    const document = contentOfLesson(ship);
    if (!document) throw new Error("lesson could not become a document");
    expect(checks(lessonOfContent(document).blocks)).toEqual(
      checks(ship.blocks),
    );
  });

  it("marks each place, and a word only right when every tile is", () => {
    const [block] = ship.blocks;
    if (block?.type !== "spelling") throw new Error("spelling expected");
    expect(
      markResponse(block, { type: "spelling", tiles: ["sh", "i", "p"] }),
    ).toMatchObject({ correct: true, fraction: 1 });
    expect(
      markResponse(block, { type: "spelling", tiles: ["sh", "a", "p"] }),
    ).toMatchObject({
      correct: false,
      parts: { "slot-1": true, "slot-2": false, "slot-3": true },
    });
  });

  it("hands a student a shuffled pile, never the word's order", () => {
    const [shown] = studentBlocks(ship, "student:1");
    if (shown?.type !== "spelling") throw new Error("spelling expected");
    expect(shown).not.toHaveProperty("tiles");
    expect(shown.places).toBe(3);
    expect(shown.pile.map((tile) => tile.text).toSorted()).toEqual([
      "a",
      "i",
      "p",
      "sh",
      "t",
    ]);
  });
});

describe("code puzzles", () => {
  const puzzle: LessonDocument = {
    version: 2,
    blocks: [
      {
        id: partId(60),
        type: "parsons",
        prompt: "Count to three.",
        points: 1,
        hints: [],
        explanation: "",
        tries: null,
        language: "python",
        lines: [
          { id: partId(61), code: "for n in range(3):", indent: 0 },
          { id: partId(62), code: "if n > 0:", indent: 1 },
          { id: partId(63), code: "print(n)", indent: 2 },
        ],
        distractors: [{ id: partId(64), code: "print n" }],
      },
    ],
  };

  it("keeps its lines, their indents and the ones that belong nowhere", () => {
    const document = contentOfLesson(puzzle);
    if (!document) throw new Error("lesson could not become a document");
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(checks(lessonOfContent(document).blocks)).toEqual(
      checks(puzzle.blocks),
    );
  });

  it("reads indentation in whatever width the teacher typed it", () => {
    const document = contentOfLesson(puzzle);
    if (!document) throw new Error("lesson could not become a document");
    const twoSpaced = JSON.parse(
      JSON.stringify(document).replaceAll("    ", "  "),
    ) as typeof document;
    const [block] = checks(lessonOfContent(twoSpaced).blocks);
    if (block?.type !== "parsons") throw new Error("parsons expected");
    expect(block.lines.map((line) => line.indent)).toEqual([0, 1, 2]);
  });
});

describe("code exercises", () => {
  const exercise: LessonDocument = {
    version: 2,
    blocks: [
      {
        id: partId(70),
        type: "program",
        prompt: "Add the two numbers.",
        points: 2,
        hints: [],
        explanation: "",
        tries: null,
        language: "python",
        starter: "a = int(input())\nb = int(input())\n    # your code",
        tests: [
          { id: partId(71), input: "2\n3", expected: "5", hidden: false },
          { id: partId(72), input: "-1\n1", expected: "0", hidden: true },
        ],
      },
    ],
  };

  it("keeps the language it is marked in", () => {
    const [block] = exercise.blocks;
    if (block?.type !== "program") throw new Error("program expected");
    const document = contentOfLesson({
      version: 2,
      blocks: [{ ...block, language: "javascript" }],
    });
    if (!document) throw new Error("lesson could not become a document");
    expect(lessonOfContent(document).blocks[0]).toMatchObject({
      language: "javascript",
    });
  });

  it("keeps its starter, its tests' lines and which tests are hidden", () => {
    const document = contentOfLesson(exercise);
    if (!document) throw new Error("lesson could not become a document");
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(checks(lessonOfContent(document).blocks)).toEqual(
      checks(exercise.blocks),
    );
  });
});

const asked = (
  id: string,
  videoAt?: number,
): LessonDocument["blocks"][number] => ({
  id,
  type: "choice",
  prompt: "What happened?",
  points: 1,
  hints: [],
  explanation: "",
  tries: null,
  ...(videoAt === undefined ? {} : { videoAt }),
  options: [
    { id: crypto.randomUUID(), text: "This", feedback: "" },
    { id: crypto.randomUUID(), text: "That", feedback: "" },
  ],
  correctOptionIds: [],
  multiple: false,
  shuffle: false,
});

describe("questions in a video", () => {
  const video = "5f1e2d3c-4b5a-4968-8778-695a4b3c2d1e";
  const later = "3b4c5d6e-7f80-4192-a3b4-c5d6e7f8091a";
  const sooner = "4c5d6e7f-8091-4a2b-b4c5-d6e7f8091a2b";
  const reading = "6e7f8091-a2b3-4c4d-95e6-f708192a3b4c";
  const withVideo: LessonDocument = {
    version: 2,
    blocks: [
      {
        id: crypto.randomUUID(),
        type: "media",
        fileId: video,
        name: "lesson.mp4",
        mediaType: "video/mp4",
        sizeBytes: 1000,
        caption: "",
        captionsFileId: "7f8091a2-b3c4-4d5e-a6f7-8192a3b4c5d6",
        captionsLang: "en",
        transcript: "",
      },
      asked(later, 90),
      asked(sooner, 30),
      asked(reading),
    ],
  };

  it("belong to the video above them, in the order it plays", () => {
    expect(videoStops(withVideo.blocks).get(video)).toEqual([
      { at: 30, blockId: sooner },
      { at: 90, blockId: later },
    ]);
  });

  it("keep their time through the document and reach the student", () => {
    const document = contentOfLesson(withVideo);
    if (!document) throw new Error("no document");
    const back = lessonOfContent(document);
    expect(
      videoStops(back.blocks)
        .get(video)
        ?.map((stop) => stop.at),
    ).toEqual([30, 90]);
    const shown = studentBlocks(back, "seed");
    expect(shown.find((block) => block.id === sooner)).toMatchObject({
      videoAt: 30,
    });
    expect(shown.find((block) => block.id === reading)).not.toHaveProperty(
      "videoAt",
    );
  });
});

describe("web projects", () => {
  const files = [
    { name: "index.html", code: '<link rel="stylesheet" href="style.css">' },
    { name: "style.css", code: "h1 {\n    color: teal;\n}" },
  ];
  const project = (starter: typeof files): LessonDocument => ({
    version: 2,
    blocks: [
      {
        id: partId(80),
        type: "project",
        prompt: "Build a page about your favourite animal.",
        points: 4,
        hints: [],
        explanation: "",
        tries: null,
        files: starter,
        gallery: false,
        language: "web" as const,
      },
    ],
  });

  it("keeps the files students start from", () => {
    const document = contentOfLesson(project(files));
    if (!document) throw new Error("lesson could not become a document");
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(checks(lessonOfContent(document).blocks)).toEqual(
      checks(project(files).blocks),
    );
  });

  it("keeps whether students may show their projects to the class", () => {
    const [block] = project(files).blocks;
    if (block?.type !== "project") throw new Error("project expected");
    const document = contentOfLesson({
      version: 2,
      blocks: [{ ...block, gallery: true }],
    });
    if (!document) throw new Error("lesson could not become a document");
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(lessonOfContent(document).blocks[0]).toMatchObject({
      gallery: true,
      language: "web" as const,
    });
  });

  it("starts from an empty page when the teacher gave no files", () => {
    const document = contentOfLesson(project([]));
    if (!document) throw new Error("lesson could not become a document");
    expect(JSON.stringify(document)).not.toContain("projectFiles");
    expect(lessonOfContent(document).blocks[0]).toMatchObject({
      type: "project",
      files: [],
    });
  });
});
