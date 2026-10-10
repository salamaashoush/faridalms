import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { LessonBlock, StudentBlock } from "@faridalms/domain/learning";

import { contentPlainText } from "@faridalms/domain/content";

/** The document as paper reads it: every toggle open. */
export function opened(node: ContentNode): ContentNode {
  return {
    ...node,
    ...(node.type === "toggle" ? { open: true } : {}),
    ...(node.children ? { children: node.children.map(opened) } : {}),
  };
}

/** An empty line, or a rule: what divides content and is none itself. */
function divides(node: ContentNode | undefined): boolean {
  return (
    node?.type === "horizontalrule" ||
    (node?.type === "paragraph" &&
      !contentPlainText({
        root: { type: "root", version: 1, children: [node] },
      }).trim())
  );
}

/**
 * The blocks as they go onto paper. A page break with nothing before it,
 * another right after it, or nothing after it would print an empty page, so
 * only breaks between content are kept; the empty lines and rules around a
 * break or at the end would spill onto a page of their own, so they go too.
 */
export function onPaper(content: ContentDocument): ContentDocument {
  const root = opened(content.root);
  const children: ContentNode[] = [];
  let pending = false;
  for (const node of root.children ?? []) {
    if (node.type === "pagebreak") {
      while (divides(children.at(-1))) children.pop();
      pending = children.length > 0;
      continue;
    }
    if (pending && !divides(node)) {
      children.push({ type: "pagebreak", version: 1 });
      pending = false;
    }
    if (!pending) children.push(node);
  }
  while (divides(children.at(-1))) children.pop();
  return { root: { ...root, children } };
}

/**
 * A lesson block as a student received it, filled out to the shape its
 * paper form reads. A student's copy never held the answers, so the paper
 * cannot print them: every key is left empty.
 */
export function paperBlock(block: StudentBlock): LessonBlock {
  const blank = { hints: [], explanation: "" };
  switch (block.type) {
    case "choice":
      return {
        ...block,
        ...blank,
        options: block.options.map((option) => ({
          id: option.id,
          text: option.text,
          picture: option.picture ?? null,
          narration: option.narration ?? null,
          feedback: "",
        })),
        correctOptionIds: [],
      };
    case "text":
      return {
        ...block,
        ...blank,
        answers: [],
      };
    case "gaps":
      return {
        ...block,
        ...blank,
        segments: block.segments.map((segment) =>
          segment.type === "text" ? segment : { ...segment, answers: [] },
        ),
      };
    case "number":
      return {
        ...block,
        ...blank,
        mode: "exact",
        value: 0,
        tolerance: 0,
        percent: false,
        min: 0,
        max: 0,
      };
    case "matching": {
      // A prompt's own answer is the choice that carries its id.
      const prompts = new Set(block.prompts.map((prompt) => prompt.id));
      return {
        ...block,
        ...blank,
        pairs: block.prompts.map((prompt) => {
          const answer = block.choices.find(
            (choice) => choice.id === prompt.id,
          );
          return {
            id: prompt.id,
            prompt: prompt.text,
            promptPicture: prompt.picture ?? null,
            promptNarration: prompt.narration ?? null,
            answer: answer?.text ?? "",
            answerPicture: answer?.picture ?? null,
            answerNarration: answer?.narration ?? null,
          };
        }),
        distractors: block.choices
          .filter((choice) => !prompts.has(choice.id))
          .map((choice) => ({
            id: choice.id,
            text: choice.text,
            picture: choice.picture ?? null,
            narration: choice.narration ?? null,
          })),
      };
    }
    case "sorting":
      return {
        ...block,
        ...blank,
        items: block.items.map((item) => ({
          id: item.id,
          text: item.text,
          picture: item.picture ?? null,
          narration: item.narration ?? null,
          groupId: "",
        })),
      };
    case "spelling":
      return {
        ...block,
        ...blank,
        tiles: block.pile.slice(0, block.places).map((tile) => tile.text),
        extras: block.pile.slice(block.places).map((tile) => tile.text),
      };
    case "parsons":
      // A student's lines come shuffled together; which belong is not theirs to know.
      return {
        ...block,
        ...blank,
        lines: block.lines.map((line) => ({ ...line, indent: 0 })),
        distractors: [],
      };
    case "program": {
      const { hiddenTests: _hidden, ...rest } = block;
      return {
        ...rest,
        ...blank,
        tests: block.tests.map((test) => ({ ...test, hidden: false })),
      };
    }
    case "written":
    case "scratch":
    case "project":
    case "ordering":
    case "counting":
    case "tracing":
    case "hotspot":
      return { ...block, ...blank };
    default:
      return block;
  }
}
