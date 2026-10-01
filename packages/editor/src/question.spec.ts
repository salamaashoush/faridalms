import type { ContentDocument } from "@faridalms/domain/content";
import type { LexicalEditor } from "lexical";

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
  $isQuestionNode,
  $isQuestionOptionNode,
  $isQuestionPromptNode,
  $toggleCorrect,
  QuestionOptionNode,
} from "./nodes";

function json(target: LexicalEditor): ContentDocument {
  return target.getEditorState().toJSON() as unknown as ContentDocument;
}

function withQuestion(kind: "choiceQuestion" | "typedQuestion") {
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
});
