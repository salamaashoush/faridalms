import type { ContentDocument } from "@faridalms/domain/content";
import type { LessonDocument } from "@faridalms/domain/learning";
import type { ElementNode, LexicalEditor } from "lexical";

import {
  contentDocumentSchema,
  contentFileIds,
} from "@faridalms/domain/content";
import {
  contentOfLesson,
  lessonOfContent,
} from "@faridalms/domain/lesson-content";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  INSERT_PARAGRAPH_COMMAND,
} from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { $duplicateBlock, $insertBlock } from "./blocks";
import { buildContentEditor } from "./headless";
import {
  $createCalloutNode,
  $createQuestionNode,
  $isQuestionGapNode,
  $isQuestionGroupNode,
  $isQuestionNode,
  $isQuestionOptionNode,
  $isQuestionPairNode,
  $isQuestionPassageNode,
  $isQuestionPromptNode,
  $setPartPicture,
  $toggleCorrect,
  QuestionOptionNode,
  setQuestionLabels,
} from "./nodes";
import { $setNarration } from "./nodes/narration";

function json(target: LexicalEditor): ContentDocument {
  return target.getEditorState().toJSON() as unknown as ContentDocument;
}

function withQuestion(
  kind:
    | "choiceQuestion"
    | "typedQuestion"
    | "orderingQuestion"
    | "matchingQuestion"
    | "sortingQuestion"
    | "gapsQuestion",
) {
  const target = buildContentEditor();
  target.update(
    () => {
      const paragraph = $createParagraphNode();
      $getRoot().clear().append(paragraph);
      paragraph.select();
      $insertBlock(kind);
    },
    { discrete: true },
  );
  return target;
}

const voice = (n: number) => `0190a1b2-0000-7000-8000-00000000030${n}`;

function write(node: ElementNode | null | undefined, text: string) {
  node?.append($createTextNode(text));
}

describe("questions in a document", () => {
  it("starts a choice question with a prompt and two options, valid as content", () => {
    const target = withQuestion("choiceQuestion");
    target.update(
      () => {
        const question = $getRoot().getChildren().find($isQuestionNode);
        const [prompt, first, second] = question?.getChildren() ?? [];
        if (
          !$isQuestionPromptNode(prompt) ||
          !$isQuestionOptionNode(first) ||
          !$isQuestionOptionNode(second)
        )
          throw new Error("question has the wrong shape");
        prompt.append($createTextNode("Which is a verb?"));
        first.append($createTextNode("Run"));
        second.append($createTextNode("Table"));
        $toggleCorrect(first);
      },
      { discrete: true },
    );
    const document = json(target);
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const [block] = lessonOfContent(document).blocks.filter(
      (item) => item.type === "choice",
    );
    expect(block).toMatchObject({
      type: "choice",
      prompt: "Which is a verb?",
      options: [{ text: "Run" }, { text: "Table" }],
    });
    expect(block?.type === "choice" ? block.correctOptionIds : []).toHaveLength(
      1,
    );
  });

  it("keeps one right option in a single-answer question", () => {
    const target = withQuestion("choiceQuestion");
    target.update(
      () => {
        const options = $getRoot()
          .getChildren()
          .find($isQuestionNode)
          ?.getChildren()
          .filter($isQuestionOptionNode);
        const [first, second] = options ?? [];
        if (!first || !second) throw new Error("no options");
        $toggleCorrect(first);
        $toggleCorrect(second);
      },
      { discrete: true },
    );
    const flags = target.read("latest", () =>
      $getRoot()
        .getChildren()
        .find($isQuestionNode)
        ?.getChildren()
        .filter($isQuestionOptionNode)
        .map((option) => option.isCorrect()),
    );
    expect(flags).toEqual([false, true]);
  });

  it("gives a duplicate new ids and leaves the original its own", () => {
    const target = withQuestion("choiceQuestion");
    const original = target.read("latest", () => {
      const question = $getRoot().getChildren().find($isQuestionNode);
      return question?.getSettings().questionId;
    });
    target.update(
      () => {
        const question = $getRoot().getChildren().find($isQuestionNode);
        if (question) $duplicateBlock(question);
      },
      { discrete: true },
    );
    const ids = target.read("latest", () =>
      $getRoot()
        .getChildren()
        .filter($isQuestionNode)
        .map((question) => question.getSettings().questionId),
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(original);
    expect(ids[1]).not.toBe(original);
    const options = target.read("latest", () =>
      $getRoot()
        .getChildren()
        .filter($isQuestionNode)
        .flatMap((question) =>
          question
            .getChildren()
            .filter($isQuestionOptionNode)
            .map((option) => option.getOptionId()),
        ),
    );
    expect(new Set(options).size).toBe(options.length);
  });

  it("turns a stray option into a paragraph and lifts a question out of a callout", () => {
    const target = buildContentEditor();
    target.update(
      () => {
        const option = new QuestionOptionNode();
        option.append($createTextNode("Lost option"));
        const callout = $createCalloutNode();
        callout.append($createQuestionNode("choice"));
        $getRoot().clear().append(option, callout);
      },
      { discrete: true },
    );
    const types = target.read("latest", () =>
      $getRoot()
        .getChildren()
        .map((node) => node.getType()),
    );
    expect(types[0]).toBe("paragraph");
    const nested = target.read("latest", () =>
      $getRoot()
        .getAllTextNodes()
        .some((node) => $isQuestionNode(node.getParent()?.getParent())),
    );
    expect(nested).toBe(false);
    expect(v.safeParse(contentDocumentSchema, json(target)).success).toBe(true);
  });

  it("moves from the prompt to the first option on Enter", () => {
    const target = withQuestion("choiceQuestion");
    target.update(
      () => {
        const prompt = $getRoot()
          .getChildren()
          .find($isQuestionNode)
          ?.getFirstChild();
        if ($isQuestionPromptNode(prompt)) prompt.selectEnd();
      },
      { discrete: true },
    );
    target.update(
      () => {
        target.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      },
      { discrete: true },
    );
    const inOption = target.read("latest", () => {
      const key = $getSelection()?.getNodes()[0]?.getKey();
      const question = $getRoot().getChildren().find($isQuestionNode);
      const first = question?.getChildren()[1];
      return Boolean(key && first && key === first.getKey());
    });
    expect(inOption).toBe(true);
  });

  it("keeps an ordering question's items and a number question's key", () => {
    const target = withQuestion("orderingQuestion");
    target.update(
      () => {
        const question = $getRoot().getChildren().find($isQuestionNode);
        const [prompt, ...items] = question?.getChildren() ?? [];
        if ($isQuestionPromptNode(prompt))
          prompt.append($createTextNode("Order the stages."));
        ["Egg", "Caterpillar", "Butterfly"].forEach((text, index) => {
          const item = items[index];
          if ($isQuestionOptionNode(item)) item.append($createTextNode(text));
        });
        const paragraph = $createParagraphNode();
        $getRoot().append(paragraph);
        paragraph.select();
        $insertBlock("numberQuestion");
        const number = $getRoot().getChildren().filter($isQuestionNode)[1];
        number?.setSettings({ answerValue: 6, tolerance: 0.5 });
        number?.getFirstChild<ElementNode>()?.append($createTextNode("Sides?"));
      },
      { discrete: true },
    );
    const document = json(target);
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const blocks = lessonOfContent(document).blocks;
    expect(blocks.find((block) => block.type === "ordering")).toMatchObject({
      items: [{ text: "Egg" }, { text: "Caterpillar" }, { text: "Butterfly" }],
    });
    expect(blocks.find((block) => block.type === "number")).toMatchObject({
      prompt: "Sides?",
      value: 6,
      tolerance: 0.5,
    });
  });

  it("keeps a matching question's pairs and a sorting question's groups", () => {
    const target = withQuestion("matchingQuestion");
    target.update(
      () => {
        const question = $getRoot().getChildren().find($isQuestionNode);
        const [prompt, ...pairs] = question?.getChildren() ?? [];
        if ($isQuestionPromptNode(prompt))
          prompt.append($createTextNode("Match the words."));
        [
          ["Big", "Large"],
          ["Quick", "Fast"],
        ].forEach(([left = "", right = ""], index) => {
          const pair = pairs[index];
          if (!$isQuestionPairNode(pair)) throw new Error("no pair");
          write(pair.getFirstChild<ElementNode>(), left);
          write(pair.getLastChild<ElementNode>(), right);
        });
        const paragraph = $createParagraphNode();
        $getRoot().append(paragraph);
        paragraph.select();
        $insertBlock("sortingQuestion");
        const sorting = $getRoot().getChildren().filter($isQuestionNode)[1];
        const groups =
          sorting?.getChildren().filter($isQuestionGroupNode) ?? [];
        [
          ["Mammals", "Cat"],
          ["Birds", "Eagle"],
        ].forEach(([name = "", item = ""], index) => {
          const group = groups[index];
          if (!group) throw new Error("no group");
          write(group.getFirstChild<ElementNode>(), name);
          const option = group.getChildren().find($isQuestionOptionNode);
          write(option, item);
        });
      },
      { discrete: true },
    );
    const document = json(target);
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const blocks = lessonOfContent(document).blocks;
    expect(blocks.find((block) => block.type === "matching")).toMatchObject({
      prompt: "Match the words.",
      pairs: [
        { prompt: "Big", answer: "Large" },
        { prompt: "Quick", answer: "Fast" },
      ],
    });
    const sorting = blocks.find((block) => block.type === "sorting");
    expect(sorting).toMatchObject({
      groups: [{ name: "Mammals" }, { name: "Birds" }],
      items: [{ text: "Cat" }, { text: "Eagle" }],
    });
    if (sorting?.type !== "sorting") throw new Error("no sorting question");
    expect(sorting.items[1]?.groupId).toBe(sorting.groups[1]?.id);
  });

  it("moves from a pair's item to its match, then to a new pair", () => {
    const target = withQuestion("matchingQuestion");
    const enter = () =>
      target.update(
        () => {
          target.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
        },
        { discrete: true },
      );
    target.update(
      () => {
        const pair = $getRoot()
          .getChildren()
          .find($isQuestionNode)
          ?.getChildren()
          .filter($isQuestionPairNode)
          .at(-1);
        pair?.getFirstChild<ElementNode>()?.append($createTextNode("Hot"));
        pair?.getFirstChild<ElementNode>()?.selectEnd();
      },
      { discrete: true },
    );
    enter();
    const where = () =>
      target.read("latest", () => {
        const side = $getSelection()?.getNodes()[0];
        const pair = side?.getParent();
        const question = $getRoot().getChildren().find($isQuestionNode);
        const pairs = question?.getChildren().filter($isQuestionPairNode) ?? [];
        return {
          pair: pairs.findIndex((item) => item.is(pair)),
          side: pair?.getChildren().findIndex((item) => item.is(side)),
          pairs: pairs.length,
        };
      });
    expect(where()).toEqual({ pair: 1, side: 1, pairs: 2 });
    enter();
    expect(where()).toEqual({ pair: 2, side: 0, pairs: 3 });
    const ids = target.read("latest", () =>
      $getRoot()
        .getChildren()
        .find($isQuestionNode)
        ?.getChildren()
        .filter($isQuestionPairNode)
        .map((pair) => pair.getOptionId()),
    );
    expect(new Set(ids).size).toBe(3);
  });

  it("makes a bracketed answer typed in a passage a gap", () => {
    const target = withQuestion("gapsQuestion");
    const type = (text: string) =>
      target.update(
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(text);
        },
        { discrete: true },
      );
    target.update(
      () => {
        const question = $getRoot().getChildren().find($isQuestionNode);
        const [prompt, passage] = question?.getChildren() ?? [];
        write(prompt as ElementNode, "Fill in the gaps.");
        if ($isQuestionPassageNode(passage)) passage.selectStart();
      },
      { discrete: true },
    );
    type("The capital is [Cairo/القاهرة]");
    type(", on the [Nile|Thames]");
    type(" river.");
    const shape = target.read("latest", () => {
      const passage = $getRoot()
        .getChildren()
        .find($isQuestionNode)
        ?.getChildren()
        .find($isQuestionPassageNode);
      return passage
        ?.getChildren()
        .map((child) =>
          $isQuestionGapNode(child)
            ? `[${child.getTextContent()}]`
            : child.getTextContent(),
        );
    });
    expect(shape).toEqual([
      "The capital is ",
      "[Cairo/القاهرة]",
      ", on the ",
      "[Nile|Thames]",
      " river.",
    ]);
    const document = json(target);
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const block = lessonOfContent(document).blocks.find(
      (item) => item.type === "gaps",
    );
    expect(block?.type === "gaps" ? block.segments : []).toMatchObject([
      { type: "text", text: "The capital is " },
      { type: "gap", answers: ["Cairo", "القاهرة"], options: [] },
      { type: "text", text: ", on the " },
      { type: "gap", answers: ["Nile"], options: ["Nile", "Thames"] },
      { type: "text", text: " river." },
    ]);
  });

  it("writes brackets in ordinary text as they were typed", () => {
    const target = buildContentEditor();
    target.update(
      () => {
        const paragraph = $createParagraphNode();
        $getRoot().clear().append(paragraph);
        paragraph.select();
        $getSelection()?.insertText("See [1] below");
      },
      { discrete: true },
    );
    expect(target.read("latest", () => $getRoot().getTextContent())).toBe(
      "See [1] below",
    );
  });

  it("keeps every id and answer of a lesson loaded into the editor", () => {
    const lesson: LessonDocument = {
      version: 2,
      blocks: [
        {
          id: crypto.randomUUID(),
          type: "media",
          fileId: crypto.randomUUID(),
          name: "talk.mp4",
          mediaType: "video/mp4",
          sizeBytes: 1000,
          caption: "A short talk",
          captionsFileId: crypto.randomUUID(),
          captionsLang: "en",
          transcript: "Hello.",
        },
        {
          id: crypto.randomUUID(),
          type: "choice",
          prompt: "Pick one",
          points: 1,
          hint: "",
          explanation: "",
          tries: null,
          options: [
            { id: crypto.randomUUID(), text: "A", feedback: "" },
            { id: crypto.randomUUID(), text: "B", feedback: "Not B" },
          ],
          correctOptionIds: [],
          multiple: false,
          shuffle: true,
        },
        { id: crypto.randomUUID(), type: "gate", requires: "above" },
        {
          id: crypto.randomUUID(),
          type: "gaps",
          prompt: "Fill in",
          points: 1,
          hint: "",
          explanation: "",
          tries: null,
          segments: [
            { type: "text", text: "Water boils at " },
            {
              type: "gap",
              id: crypto.randomUUID(),
              answers: ["100"],
              options: [],
            },
            { type: "text", text: " degrees." },
          ],
          caseSensitive: false,
          closeEnough: false,
          tehMarbuta: true,
        },
        {
          id: crypto.randomUUID(),
          type: "sorting",
          prompt: "Sort",
          points: 1,
          hint: "",
          explanation: "",
          tries: null,
          groups: [
            { id: crypto.randomUUID(), name: "Odd" },
            { id: crypto.randomUUID(), name: "Even" },
          ],
          items: [],
        },
      ],
    };
    const [, choice, , gaps, sorting] = lesson.blocks;
    if (choice?.type === "choice" && choice.options[0])
      choice.correctOptionIds = [choice.options[0].id];
    if (sorting?.type === "sorting" && sorting.groups[0] && sorting.groups[1])
      sorting.items = [
        { id: crypto.randomUUID(), text: "3", groupId: sorting.groups[0].id },
        { id: crypto.randomUUID(), text: "4", groupId: sorting.groups[1].id },
      ];
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    const target = buildContentEditor();
    target.setEditorState(target.parseEditorState(JSON.stringify(document)));
    target.update(() => $getRoot().markDirty(), { discrete: true });
    const back = lessonOfContent(json(target)).blocks;
    expect(back.filter((block) => block.type === "gate")).toHaveLength(1);
    for (const block of [choice, gaps, sorting])
      expect(back.find((item) => item.id === block?.id)).toEqual(block);
    expect(json(target).root.children?.[0]).toMatchObject({
      type: "media",
      captionsLang: "en",
      transcript: "Hello.",
    });
  });

  it("inserts a gate only at the top of the document", () => {
    const target = buildContentEditor();
    target.update(
      () => {
        const paragraph = $createParagraphNode();
        $getRoot().clear().append(paragraph);
        paragraph.select();
        $insertBlock("gate");
      },
      { discrete: true },
    );
    const document = json(target);
    expect(document.root.children?.map((node) => node.type)).toContain("gate");
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(
      lessonOfContent(document).blocks.map((block) => block.type),
    ).toContain("gate");
  });

  it("fills the empty option below before adding another", () => {
    const target = withQuestion("choiceQuestion");
    target.update(
      () => {
        const prompt = $getRoot()
          .getChildren()
          .find($isQuestionNode)
          ?.getFirstChild();
        if ($isQuestionPromptNode(prompt)) prompt.selectEnd();
      },
      { discrete: true },
    );
    for (const text of ["Which?", "The beginning", "The end"]) {
      target.update(
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(text);
        },
        { discrete: true },
      );
      if (text !== "The end")
        target.update(
          () => {
            target.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
          },
          { discrete: true },
        );
    }
    const options = target.read("latest", () =>
      $getRoot()
        .getChildren()
        .find($isQuestionNode)
        ?.getChildren()
        .filter($isQuestionOptionNode)
        .map((option) => option.getTextContent()),
    );
    expect(options).toEqual(["The beginning", "The end"]);
  });

  it("starts a true or false question with true marked right", () => {
    const target = buildContentEditor();
    setQuestionLabels(target, {
      kinds: {
        choice: "",
        text: "",
        written: "",
        number: "",
        ordering: "",
        matching: "",
        sorting: "",
        gaps: "",
        counting: "",
        tracing: "",
        spelling: "",
        hotspot: "",
        scratch: "",
      },
      points: () => "",
      answerIs: "",
      prompt: "",
      option: "",
      answer: "",
      accepted: "",
      pairPrompt: "",
      pairAnswer: "",
      extra: "",
      groupName: "",
      item: "",
      passage: "",
      statementTrue: "True",
      statementFalse: "False",
    });
    target.update(
      () => {
        const paragraph = $createParagraphNode();
        $getRoot().clear().append(paragraph);
        paragraph.select();
        $insertBlock("trueFalseQuestion");
        $getRoot()
          .getChildren()
          .find($isQuestionNode)
          ?.getFirstChild<ElementNode>()
          ?.append($createTextNode("The sun is a star."));
      },
      { discrete: true },
    );
    const block = lessonOfContent(json(target)).blocks.find(
      (item) => item.type === "choice",
    );
    if (block?.type !== "choice") throw new Error("no choice question");
    expect(block.options.map((option) => option.text)).toEqual([
      "True",
      "False",
    ]);
    expect(block.correctOptionIds).toEqual([block.options[0]?.id]);
    expect(block.shuffle).toBe(false);
  });

  it("keeps a picture on a part, with its words left out, through the document", () => {
    const cat = "0190a1b2-0000-7000-8000-0000000000c1";
    const target = withQuestion("matchingQuestion");
    target.update(
      () => {
        const question = $getRoot().getChildren().find($isQuestionNode);
        const [prompt, ...pairs] = question?.getChildren() ?? [];
        if ($isQuestionPromptNode(prompt))
          prompt.append($createTextNode("Match each animal to its name."));
        pairs.slice(0, 2).forEach((pair, index) => {
          if (!$isQuestionPairNode(pair)) throw new Error("no pair");
          const side = pair.getFirstChild<ElementNode>();
          if (side)
            $setPartPicture(side, {
              fileId: cat,
              alt: index === 0 ? "A cat" : "Another cat",
            });
          write(
            pair.getLastChild<ElementNode>(),
            index === 0 ? "Cat" : "Kitten",
          );
        });
      },
      { discrete: true },
    );
    const document = json(target);
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const matching = lessonOfContent(document).blocks.find(
      (block) => block.type === "matching",
    );
    expect(matching).toMatchObject({
      pairs: [
        {
          prompt: "",
          promptPicture: { fileId: cat, alt: "A cat" },
          answer: "Cat",
        },
        {
          prompt: "",
          promptPicture: { fileId: cat, alt: "Another cat" },
          answer: "Kitten",
        },
      ],
    });
    const again = buildContentEditor();
    again.setEditorState(again.parseEditorState(JSON.stringify(document)));
    expect(json(again)).toEqual(document);
  });

  it("keeps a recording on a question, its parts and a plain block through the document", () => {
    const target = withQuestion("sortingQuestion");
    target.update(
      () => {
        const question = $getRoot().getChildren().find($isQuestionNode);
        if (!question) throw new Error("no question");
        const [prompt, group] = question.getChildren();
        if ($isQuestionPromptNode(prompt))
          prompt.append($createTextNode("Which ones fly?"));
        $setNarration(question, voice(1));
        if (!$isQuestionGroupNode(group)) throw new Error("no group");
        const [name, item] = group.getChildren<ElementNode>();
        write(name, "Flies");
        if (name) $setNarration(name, voice(2));
        write(item, "Bird");
        if (item) $setNarration(item, voice(3));
        const intro = $createParagraphNode().append($createTextNode("Listen."));
        $setNarration(intro, voice(4));
        question.insertBefore(intro);
      },
      { discrete: true },
    );
    const document = json(target);
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(contentFileIds(document).toSorted()).toEqual(
      [1, 2, 3, 4].map(voice),
    );
    const sorting = lessonOfContent(document).blocks.find(
      (block) => block.type === "sorting",
    );
    if (sorting?.type !== "sorting") throw new Error("sorting expected");
    expect(sorting.narration).toBe(voice(1));
    expect(sorting.groups[0]).toMatchObject({
      name: "Flies",
      narration: voice(2),
    });
    expect(sorting.items[0]).toMatchObject({
      text: "Bird",
      narration: voice(3),
    });
    const again = buildContentEditor();
    again.setEditorState(again.parseEditorState(JSON.stringify(document)));
    expect(json(again)).toEqual(document);
  });

  it("keeps an empty option that shows a picture when Backspace reaches its start", () => {
    const target = withQuestion("choiceQuestion");
    target.update(
      () => {
        const question = $getRoot().getChildren().find($isQuestionNode);
        const option = question?.getChildren().find($isQuestionOptionNode);
        if (!option) throw new Error("no option");
        $setPartPicture(option, {
          fileId: "0190a1b2-0000-7000-8000-0000000000c1",
          alt: "A cat",
        });
        option.selectStart();
        option.collapseAtStart();
      },
      { discrete: true },
    );
    target.getEditorState().read(() => {
      const question = $getRoot().getChildren().find($isQuestionNode);
      expect(
        question?.getChildren().filter($isQuestionOptionNode),
      ).toHaveLength(2);
    });
  });
});
