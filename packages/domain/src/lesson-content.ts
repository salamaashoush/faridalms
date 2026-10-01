import type { ContentDocument, ContentNode } from "./content";
import type { LessonBlock, LessonDocument } from "./learning";

/**
 * A lesson is written as one document whose questions are blocks in the
 * text. The server, the player and marking read it as the list of blocks
 * they always have: each run of text between questions is a content block,
 * each question a check with the id it was given, so answers already given
 * still match.
 */

function textOf(node: ContentNode | undefined): string {
  if (!node) return "";
  if (node.type === "linebreak") return "\n";
  if (typeof node.text === "string") return node.text;
  return (node.children ?? []).map(textOf).join("");
}

/** A stable id for a run of text: the same document always gives the same ids. */
function runId(seed: string): string {
  const words = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  for (let part = 0; part < words.length; part += 1)
    for (const character of `${part}:${seed}`) {
      words[part] = Math.imul(
        (words[part] ?? 0) ^ character.charCodeAt(0),
        0x01000193,
      );
    }
  const hex = words
    .map((word) => (word >>> 0).toString(16).padStart(8, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function questionBlock(node: ContentNode): LessonBlock | null {
  const [prompt, ...parts] = node.children ?? [];
  if (!node.questionId || !node.kind) return null;
  const check = {
    id: node.questionId,
    prompt: textOf(prompt).trim(),
    points: node.points ?? 1,
    hint: node.hint ?? "",
    explanation: node.explanation ?? "",
    tries: node.tries ?? null,
  };
  switch (node.kind) {
    case "choice": {
      const options = parts.filter((part) => part.type === "question-option");
      return {
        ...check,
        type: "choice",
        options: options.map((option) => ({
          id: option.optionId ?? "",
          text: textOf(option).trim(),
          feedback: option.feedback ?? "",
        })),
        correctOptionIds: options
          .filter((option) => option.correct)
          .map((option) => option.optionId ?? ""),
        multiple: node.multiple ?? false,
        shuffle: node.shuffle ?? true,
      };
    }
    case "text":
      return {
        ...check,
        type: "text",
        answers: parts
          .filter((part) => part.type === "question-answer")
          .map((answer) => textOf(answer).trim())
          .filter(Boolean),
        caseSensitive: node.caseSensitive ?? false,
        closeEnough: node.closeEnough ?? false,
        tehMarbuta: node.tehMarbuta ?? true,
      };
    case "written":
      return { ...check, type: "written", wordLimit: node.wordLimit ?? null };
  }
  return null;
}

/** The lesson's blocks as the document reads them, text and questions in order. */
export function lessonOfContent(document: ContentDocument): LessonDocument {
  const blocks: LessonBlock[] = [];
  let run: ContentNode[] = [];
  const flush = () => {
    if (run.length === 0) return;
    blocks.push({
      id: runId(JSON.stringify(run[0]?.$ ?? blocks.length)),
      type: "content",
      content: { root: { ...document.root, children: run } },
    });
    run = [];
  };
  for (const child of document.root.children ?? []) {
    if (child.type !== "question") {
      run.push(child);
      continue;
    }
    flush();
    const block = questionBlock(child);
    if (block) blocks.push(block);
  }
  flush();
  return { version: 2, blocks };
}

const paragraphOf = (text: string): ContentNode => ({
  type: "paragraph",
  version: 1,
  direction: null,
  format: "",
  indent: 0,
  textFormat: 0,
  textStyle: "",
  children: text
    ? [
        {
          type: "text",
          version: 1,
          format: 0,
          detail: 0,
          mode: "normal",
          style: "",
          text,
        },
      ]
    : [],
});

function inlineOf(type: ContentNode["type"], text: string): ContentNode {
  const paragraph = paragraphOf(text);
  return { ...paragraph, type };
}

/**
 * A question written as a block in a document, from the check it was. Null
 * for kinds documents cannot hold yet.
 */
export function questionNode(block: LessonBlock): ContentNode | null {
  if (
    block.type !== "choice" &&
    block.type !== "text" &&
    block.type !== "written"
  )
    return null;
  const base: ContentNode = {
    type: "question",
    version: 1,
    format: "",
    indent: 0,
    direction: null,
    kind: block.type,
    questionId: block.id,
    points: block.points,
    tries: block.tries,
    hint: block.hint,
    explanation: block.explanation,
    children: [inlineOf("question-prompt", block.prompt)],
  };
  if (block.type === "choice")
    return {
      ...base,
      multiple: block.multiple,
      shuffle: block.shuffle,
      children: [
        ...(base.children ?? []),
        ...block.options.map((option) => ({
          ...inlineOf("question-option", option.text),
          optionId: option.id,
          correct: block.correctOptionIds.includes(option.id),
          feedback: option.feedback,
        })),
      ],
    };
  if (block.type === "text")
    return {
      ...base,
      caseSensitive: block.caseSensitive,
      closeEnough: block.closeEnough,
      tehMarbuta: block.tehMarbuta,
      children: [
        ...(base.children ?? []),
        ...block.answers.map((answer) => inlineOf("question-answer", answer)),
      ],
    };
  return { ...base, wordLimit: block.wordLimit };
}

/**
 * A lesson's blocks as one document, for moving lessons written as lists
 * into the editor. Null when the lesson holds a block documents cannot hold.
 */
export function contentOfLesson(
  lesson: LessonDocument,
): ContentDocument | null {
  const children: ContentNode[] = [];
  for (const block of lesson.blocks) {
    if (block.type === "content") {
      children.push(...(block.content.root.children ?? []));
      continue;
    }
    const node = questionNode(block);
    if (!node) return null;
    children.push(node);
  }
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: children.length ? children : [paragraphOf("")],
    },
  };
}
