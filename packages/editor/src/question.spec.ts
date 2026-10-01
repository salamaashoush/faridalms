import type { ContentDocument } from "@faridalms/domain/content";
import type { ElementNode, LexicalEditor } from "lexical";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { lessonOfContent } from "@faridalms/domain/lesson-content";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  INSERT_PARAGRAPH_COMMAND,
} from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { $duplicateBlock, $insertBlock } from "./blocks";
import { buildContentEditor } from "./headless";
import {
  $createCalloutNode,
  $createQuestionNode,
  $isQuestionGroupNode,
  $isQuestionNode,
  $isQuestionOptionNode,
  $isQuestionPairNode,
  $isQuestionPromptNode,
  $toggleCorrect,
  QuestionOptionNode,
} from "./nodes";

function json(target: LexicalEditor): ContentDocument {
  return target.getEditorState().toJSON() as unknown as ContentDocument;
}

function withQuestion(
  kind:
    | "choiceQuestion"
    | "typedQuestion"
    | "orderingQuestion"
    | "matchingQuestion"
    | "sortingQuestion",
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
});
