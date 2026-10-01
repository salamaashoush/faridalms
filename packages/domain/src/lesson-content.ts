import type { ContentDocument, ContentNode } from "./content";
import type { GapSegment } from "./gaps";
import type { LessonBlock, LessonDocument } from "./learning";

import { sameContent } from "./content";
import { gapsSource, parseGaps } from "./gaps";

/**
 * A lesson is written as one document whose questions are blocks in the
 * text. The server, the player and marking read it as the list of blocks
 * they always have: each run of text between questions is a content block,
 * each question a check with the id it was given, so answers already given
 * still match.
 */

/** Whether a stored lesson is a document, rather than a list of blocks. */
export function isContentDocument(value: unknown): value is ContentDocument {
  return typeof value === "object" && value !== null && "root" in value;
}

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

/**
 * A gaps passage as the segments marking reads: each paragraph's text in
 * turn, a new line between paragraphs, and each gap's answers read from the
 * words written in it, "Cairo/القاهرة" or "right|wrong|wrong".
 */
function segmentsOf(passages: readonly ContentNode[]): GapSegment[] {
  const segments: GapSegment[] = [];
  const write = (text: string) => {
    const last = segments.at(-1);
    if (last?.type === "text") last.text += text;
    else if (text) segments.push({ type: "text", text });
  };
  passages.forEach((passage, index) => {
    if (index > 0) write("\n");
    for (const child of passage.children ?? []) {
      if (child.type !== "question-gap") {
        write(textOf(child));
        continue;
      }
      const [gap] = parseGaps(`[${textOf(child)}]`, [child.optionId ?? ""]);
      if (gap) segments.push(gap);
    }
  });
  return segments;
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
      const options = parts.filter(
        (part) => part.type === "question-option" && textOf(part).trim(),
      );
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
    case "number":
      return {
        ...check,
        type: "number",
        mode: node.numberMode ?? "exact",
        value: node.answerValue ?? 0,
        tolerance: node.tolerance ?? 0,
        percent: node.percent ?? false,
        min: node.rangeMin ?? 0,
        max: node.rangeMax ?? 0,
      };
    case "ordering":
      return {
        ...check,
        type: "ordering",
        items: parts
          .filter(
            (part) => part.type === "question-option" && textOf(part).trim(),
          )
          .map((item) => ({
            id: item.optionId ?? "",
            text: textOf(item).trim(),
          })),
        scoring: node.scoring ?? "all",
      };
    case "matching":
      return {
        ...check,
        type: "matching",
        pairs: parts
          .filter(
            (part) => part.type === "question-pair" && textOf(part).trim(),
          )
          .map((pair) => ({
            id: pair.optionId ?? "",
            prompt: textOf(pair.children?.[0]).trim(),
            answer: textOf(pair.children?.[1]).trim(),
          })),
        distractors: parts
          .filter((part) => part.type === "question-answer")
          .map((extra) => ({
            id: extra.optionId ?? "",
            text: textOf(extra).trim(),
          }))
          .filter((extra) => extra.text),
      };
    case "gaps":
      return {
        ...check,
        type: "gaps",
        segments: segmentsOf(
          parts.filter((part) => part.type === "question-passage"),
        ),
        caseSensitive: node.caseSensitive ?? false,
        closeEnough: node.closeEnough ?? false,
        tehMarbuta: node.tehMarbuta ?? true,
      };
    case "sorting": {
      const groups = parts.filter((part) => part.type === "question-group");
      return {
        ...check,
        type: "sorting",
        groups: groups.map((group) => ({
          id: group.optionId ?? "",
          name: textOf(group.children?.[0]).trim(),
        })),
        items: groups.flatMap((group) =>
          (group.children ?? [])
            .filter(
              (item) => item.type === "question-option" && textOf(item).trim(),
            )
            .map((item) => ({
              id: item.optionId ?? "",
              text: textOf(item).trim(),
              groupId: group.optionId ?? "",
            })),
        ),
      };
    }
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
    if (child.type === "gate") {
      flush();
      blocks.push({
        id: runId(`gate:${JSON.stringify(child.$ ?? blocks.length)}`),
        type: "gate",
        requires: "above",
      });
      continue;
    }
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

const opensQuiz = (node: ContentNode) =>
  node.type === "question" || node.type === "gate";

/** Whether a document asks questions of its own. */
export function holdsQuestions(document: ContentDocument): boolean {
  return (document.root.children ?? []).some(
    (node) => node.type === "question",
  );
}

/**
 * A quiz is written as its brief: the words before its first question are
 * what students read before they start, and hold no answers.
 */
export function quizIntro(document: ContentDocument): ContentDocument {
  const children = document.root.children ?? [];
  const first = children.findIndex(opensQuiz);
  return {
    root: {
      ...document.root,
      children: first < 0 ? children : children.slice(0, first),
    },
  };
}

/** The quiz a brief asks, from its first question on, as marking reads it. */
export function quizOfBrief(document: ContentDocument): LessonDocument {
  const children = document.root.children ?? [];
  const first = children.findIndex(opensQuiz);
  return lessonOfContent({
    root: {
      ...document.root,
      children: first < 0 ? [] : children.slice(first),
    },
  });
}

/**
 * A brief with the questions of a quiz kept apart from it written in after
 * its words, every question keeping its id, for quizzes set before their
 * questions were part of the brief.
 */
export function briefWithQuiz(
  brief: ContentDocument,
  quiz: LessonDocument,
): ContentDocument {
  const asked = contentOfLesson(quiz)?.root.children ?? [];
  return {
    root: {
      ...brief.root,
      children: [...(brief.root.children ?? []), ...asked],
    },
  };
}

/**
 * Whether two documents put the same lesson in front of students: the same
 * words and the same questions, whatever ids the editor gave the blocks.
 */
export function sameLesson(a: ContentDocument, b: ContentDocument): boolean {
  const left = lessonOfContent(a).blocks;
  const right = lessonOfContent(b).blocks;
  return (
    left.length === right.length &&
    left.every((block, index) => {
      const other = right[index];
      if (block.type === "content")
        return (
          other?.type === "content" && sameContent(block.content, other.content)
        );
      if (block.type === "gate") return other?.type === "gate";
      return JSON.stringify(block) === JSON.stringify(other);
    })
  );
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

function gapNode(segment: Extract<GapSegment, { type: "gap" }>): ContentNode {
  return {
    ...inlineOf("question-gap", gapsSource([segment]).slice(1, -1)),
    optionId: segment.id,
  };
}

function passagesOf(segments: readonly GapSegment[]): ContentNode[] {
  const passages: ContentNode[] = [inlineOf("question-passage", "")];
  const current = () => passages.at(-1)?.children ?? [];
  for (const segment of segments) {
    if (segment.type === "gap") {
      current().push(gapNode(segment));
      continue;
    }
    segment.text.split("\n").forEach((line, index) => {
      if (index > 0) passages.push(inlineOf("question-passage", ""));
      if (line) current().push(...(paragraphOf(line).children ?? []));
    });
  }
  return passages;
}

/**
 * A question written as a block in a document, from the check it was. Null
 * for kinds documents cannot hold yet.
 */
export function questionNode(block: LessonBlock): ContentNode | null {
  if (
    block.type !== "choice" &&
    block.type !== "text" &&
    block.type !== "written" &&
    block.type !== "number" &&
    block.type !== "ordering" &&
    block.type !== "matching" &&
    block.type !== "sorting" &&
    block.type !== "gaps"
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
  if (block.type === "gaps")
    return {
      ...base,
      caseSensitive: block.caseSensitive,
      closeEnough: block.closeEnough,
      tehMarbuta: block.tehMarbuta,
      children: [...(base.children ?? []), ...passagesOf(block.segments)],
    };
  if (block.type === "number")
    return {
      ...base,
      numberMode: block.mode,
      answerValue: block.value,
      tolerance: block.tolerance,
      percent: block.percent,
      rangeMin: block.min,
      rangeMax: block.max,
    };
  if (block.type === "ordering")
    return {
      ...base,
      scoring: block.scoring,
      children: [
        ...(base.children ?? []),
        ...block.items.map((item) => ({
          ...inlineOf("question-option", item.text),
          optionId: item.id,
        })),
      ],
    };
  if (block.type === "matching")
    return {
      ...base,
      children: [
        ...(base.children ?? []),
        ...block.pairs.map((pair): ContentNode => ({
          type: "question-pair",
          version: 1,
          format: "",
          indent: 0,
          direction: null,
          optionId: pair.id,
          children: [
            inlineOf("question-side", pair.prompt),
            inlineOf("question-side", pair.answer),
          ],
        })),
        ...block.distractors.map((extra) => ({
          ...inlineOf("question-answer", extra.text),
          optionId: extra.id,
        })),
      ],
    };
  if (block.type === "sorting")
    return {
      ...base,
      children: [
        ...(base.children ?? []),
        ...block.groups.map((group): ContentNode => ({
          type: "question-group",
          version: 1,
          format: "",
          indent: 0,
          direction: null,
          optionId: group.id,
          children: [
            inlineOf("question-side", group.name),
            ...block.items
              .filter((item) => item.groupId === group.id)
              .map((item) => ({
                ...inlineOf("question-option", item.text),
                optionId: item.id,
              })),
          ],
        })),
      ],
    };
  return { ...base, wordLimit: block.wordLimit };
}

/** A media block as the image, player or file card a document shows it as. */
function mediaNode(
  block: Extract<LessonBlock, { type: "media" }>,
): ContentNode {
  const leaf = { version: 1, format: "", fileId: block.fileId } as const;
  if (/^(audio|video)\//.test(block.mediaType))
    return {
      ...leaf,
      type: "media",
      mime: block.mediaType,
      caption: block.caption,
      ...(block.captionsFileId ? { captionsFileId: block.captionsFileId } : {}),
      captionsLang: block.captionsLang,
      ...(block.transcript ? { transcript: block.transcript } : {}),
      size: "full",
    };
  if (block.mediaType.startsWith("image/"))
    return {
      ...leaf,
      type: "image",
      alt: block.caption,
      caption: block.caption,
      size: "full",
    };
  return {
    ...leaf,
    type: "file",
    name: block.name,
    mime: block.mediaType,
    bytes: block.sizeBytes,
    ...(block.caption ? { caption: block.caption } : {}),
  };
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
    if (block.type === "media") {
      children.push(mediaNode(block));
      continue;
    }
    if (block.type === "gate") {
      children.push({ type: "gate", version: 1 });
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
