import { firstLevel } from "@faridalms/puzzles/levels";

import type { ContentDocument, ContentNode } from "./content";
import type { GapSegment } from "./gaps";
import type {
  CheckBlock,
  DrawBlock,
  HighlightBlock,
  LessonBlock,
  LessonDocument,
  RecordSeconds,
} from "./learning";

import { mathRuns, mathText, sameContent } from "./content";
import { gapsSource, parseGaps } from "./gaps";
import { FLASH_SECONDS, isCheck, MAX_INDENT, RECORD_SECONDS } from "./learning";

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

/** How far a line of code is indented, with a tab as four spaces. */
function leadingWidth(text: string): number {
  const lead = /^[\t ]*/.exec(text)?.[0] ?? "";
  return lead.replaceAll("\t", "    ").length;
}

/**
 * An accepted answer's LaTeX: the formula written on its line, or the line
 * itself where a teacher typed the LaTeX as words.
 */
const latexOf = (text: string) =>
  mathRuns(text)
    .map((run) => ("latex" in run ? run.latex : run.text))
    .join("")
    .trim();

function textOf(node: ContentNode | undefined): string {
  if (!node) return "";
  if (node.type === "linebreak") return "\n";
  if (node.type === "math") return mathText(node);
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

/** A recording length the lesson allows, or none for a written answer. */
const spokenFor = (seconds: number | null | undefined): RecordSeconds | null =>
  RECORD_SECONDS.find((allowed) => allowed === seconds) ?? null;

/** A glimpse the lesson allows, or none to keep things in view. */
const flashFor = (seconds: number | null | undefined) =>
  FLASH_SECONDS.find((allowed) => allowed === seconds) ?? null;

/** A part's picture, when it has one. */
function pictureOf(node: ContentNode | undefined) {
  return node?.fileId ? { fileId: node.fileId, alt: node.alt ?? "" } : null;
}

/** A block's or part's recording, as the field a check keeps it in. */
const voiceOf = (node: ContentNode | undefined) =>
  node?.$?.narration ? { narration: node.$.narration } : {};

/** A question's recording with when each word of its prompt starts in it. */
const promptVoiceOf = (node: ContentNode) => ({
  ...voiceOf(node),
  ...(node.$?.narration && node.$.words?.length
    ? { narrationWords: node.$.words }
    : {}),
});

/** A recording as the editor's state on the node that reads it. */
const voiced = (
  narration: string | null | undefined,
  words?: number[] | null,
) =>
  narration ? { $: { narration, ...(words?.length ? { words } : {}) } } : {};

/** Whether a part says anything: words, or a picture. */
const written = (node: ContentNode | undefined) =>
  Boolean(textOf(node).trim() || node?.fileId);

/** A part's picture as the attributes its node keeps. */
function pictureFields(
  picture: { fileId: string; alt: string } | null | undefined,
) {
  return picture ? { fileId: picture.fileId, alt: picture.alt } : {};
}

/**
 * A question's hints in order. Questions written when each had one hint keep
 * it under `hint`, in saved documents and in the editor's shared state alike.
 */
export function hintsOf(question: { hint?: unknown; hints?: unknown }) {
  if (Array.isArray(question.hints))
    return question.hints.filter(
      (hint): hint is string => typeof hint === "string" && hint.trim() !== "",
    );
  return typeof question.hint === "string" && question.hint.trim() !== ""
    ? [question.hint]
    : [];
}

/** The question a question node asks, with its key, as the player marks it. */
export function questionBlock(node: ContentNode): LessonBlock | null {
  const [prompt, ...parts] = node.children ?? [];
  if (!node.questionId || !node.kind) return null;
  const check = {
    id: node.questionId,
    prompt: textOf(prompt).trim(),
    ...promptVoiceOf(node),
    points: node.points ?? 1,
    hints: hintsOf(node),
    explanation: node.explanation ?? "",
    tries: node.tries ?? null,
    ...(node.feedbackAt && node.feedbackAt !== "now"
      ? { feedbackAt: node.feedbackAt }
      : {}),
    ...(typeof node.videoAt === "number" ? { videoAt: node.videoAt } : {}),
    ...(node.standards?.length ? { standards: node.standards } : {}),
  };
  switch (node.kind) {
    case "choice": {
      const options = parts.filter(
        (part) => part.type === "question-option" && written(part),
      );
      return {
        ...check,
        type: "choice",
        options: options.map((option) => ({
          id: option.optionId ?? "",
          text: textOf(option).trim(),
          ...(option.fileId ? { picture: pictureOf(option) } : {}),
          ...voiceOf(option),
          feedback: option.feedback ?? "",
        })),
        correctOptionIds: options
          .filter((option) => option.correct)
          .map((option) => option.optionId ?? ""),
        multiple: node.multiple ?? false,
        shuffle: node.shuffle ?? true,
      };
    }
    case "poll": {
      // A poll is asked once, with nothing to count, hint at or wait for.
      const { feedbackAt: _at, standards: _standards, ...asked } = check;
      return {
        ...asked,
        type: "poll",
        points: 0,
        hints: [],
        tries: null,
        options: parts
          .filter((part) => part.type === "question-option" && written(part))
          .map((option) => ({
            id: option.optionId ?? "",
            text: textOf(option).trim(),
            ...(option.fileId ? { picture: pictureOf(option) } : {}),
            ...voiceOf(option),
            feedback: option.feedback ?? "",
          })),
        multiple: node.multiple ?? false,
        classResults: node.classResults ?? true,
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
    case "math":
      return {
        ...check,
        type: "math",
        answers: parts
          .filter((part) => part.type === "question-answer")
          .map((answer) => latexOf(textOf(answer)))
          .filter(Boolean),
        tolerance: node.tolerance ?? 0,
      };
    case "tracing":
      return { ...check, type: "tracing", strokes: node.trace ?? [] };
    case "scratch":
      return {
        ...check,
        type: "scratch",
        starter: node.projectFileId ? { fileId: node.projectFileId } : null,
        gallery: node.gallery ?? false,
        checks: node.projectChecks ?? [],
      };
    case "project":
      return {
        ...check,
        type: "project",
        files: node.projectFiles ?? [],
        gallery: node.gallery ?? false,
        language: node.projectLanguage ?? "web",
      };
    case "puzzle":
      return {
        ...check,
        type: "puzzle",
        level: node.puzzle ?? firstLevel("blocks"),
      };
    case "hotspot":
      return {
        ...check,
        type: "hotspot",
        picture: pictureOf(node),
        places: (node.places ?? []).map(
          ({
            box: [left = 0, top = 0, width = 0, height = 0],
            name,
            correct,
          }) => ({
            box: [left, top, width, height] as [number, number, number, number],
            name,
            correct,
          }),
        ),
      };
    case "crossword":
      return {
        ...check,
        type: "crossword",
        words: parts
          .filter(
            (part) =>
              part.type === "question-pair" &&
              (written(part.children?.[0]) || written(part.children?.[1])),
          )
          .map((pair) => {
            const [word, clue] = pair.children ?? [];
            return {
              id: pair.optionId ?? "",
              answer: textOf(word).trim(),
              clue: textOf(clue).trim(),
            };
          }),
      };
    case "labelling":
      return {
        ...check,
        type: "labelling",
        picture: pictureOf(node),
        places: (node.places ?? []).map(
          ({ box: [left = 0, top = 0, width = 0, height = 0], name }) => ({
            box: [left, top, width, height] as [number, number, number, number],
            name: name.trim(),
          }),
        ),
        extras: (node.bank ?? []).map((label) => label.trim()).filter(Boolean),
      };
    case "spelling": {
      // The first answer line is the word's tiles; any after it, extras.
      const [word, ...extra] = parts.filter(
        (part) => part.type === "question-answer",
      );
      const tilesOf = (line: ContentNode | undefined) =>
        textOf(line).split(/\s+/).filter(Boolean);
      return {
        ...check,
        type: "spelling",
        picture: pictureOf(node),
        tiles: tilesOf(word),
        extras: extra.flatMap(tilesOf),
      };
    }
    case "counting":
      return {
        ...check,
        type: "counting",
        picture: pictureOf(node),
        count: node.count ?? 5,
        mode: node.countMode ?? "count",
        layout: node.countLayout ?? "scatter",
        flashSeconds: flashFor(node.flashSeconds),
      };
    case "written": {
      const spoken = spokenFor(node.recordSeconds);
      const pictured = spoken === null ? (node.answerWith ?? null) : null;
      return {
        ...check,
        type: "written",
        wordLimit: node.wordLimit ?? null,
        ...(spoken === null ? {} : { recordSeconds: spoken }),
        ...(spoken !== null && node.recordVideo ? { recordVideo: true } : {}),
        ...(pictured === null ? {} : { answerWith: pictured }),
      };
    }
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
        ...(node.line ? { line: node.line } : {}),
      };
    case "ordering":
      return {
        ...check,
        type: "ordering",
        items: parts
          .filter((part) => part.type === "question-option" && written(part))
          .map((item) => ({
            id: item.optionId ?? "",
            text: textOf(item).trim(),
            ...(item.fileId ? { picture: pictureOf(item) } : {}),
            ...voiceOf(item),
          })),
        scoring: node.scoring ?? "all",
      };
    case "parsons": {
      // A line marked on its circle is one that belongs nowhere in the program.
      const lines = parts.filter(
        (part) => part.type === "question-option" && textOf(part).trim(),
      );
      const widths = lines
        .filter((line) => !line.correct)
        .map((line) => leadingWidth(textOf(line)));
      const unit = Math.min(...widths.filter((width) => width > 0), 4);
      return {
        ...check,
        type: "parsons",
        language: node.codeLanguage ?? "python",
        lines: lines
          .filter((line) => !line.correct)
          .map((line) => ({
            id: line.optionId ?? "",
            code: textOf(line).trim(),
            indent: Math.min(
              MAX_INDENT,
              Math.round(leadingWidth(textOf(line)) / unit),
            ),
          })),
        distractors: lines
          .filter((line) => line.correct)
          .map((line) => ({
            id: line.optionId ?? "",
            code: textOf(line).trim(),
          })),
      };
    }
    case "program": {
      const starter = parts
        .filter((part) => part.type === "question-option")
        .map((line) => textOf(line).trimEnd());
      while (starter.at(-1) === "") starter.pop();
      return {
        ...check,
        type: "program",
        language: node.codeLanguage === "javascript" ? "javascript" : "python",
        starter: starter.join("\n"),
        tests: parts
          .filter(
            (part) =>
              part.type === "question-pair" &&
              (written(part.children?.[0]) || written(part.children?.[1])),
          )
          .map((test) => ({
            id: test.optionId ?? "",
            input: textOf(test.children?.[0]),
            expected: textOf(test.children?.[1]),
            hidden: test.hidden === true,
          })),
      };
    }
    case "matching":
      return {
        ...check,
        type: "matching",
        ...(node.memory ? { memory: true } : {}),
        pairs: parts
          .filter(
            (part) =>
              part.type === "question-pair" &&
              (written(part.children?.[0]) || written(part.children?.[1])),
          )
          .map((pair) => {
            const [asked, matched] = pair.children ?? [];
            return {
              id: pair.optionId ?? "",
              prompt: textOf(asked).trim(),
              ...(asked?.fileId ? { promptPicture: pictureOf(asked) } : {}),
              ...(asked?.$?.narration
                ? { promptNarration: asked.$.narration }
                : {}),
              answer: textOf(matched).trim(),
              ...(matched?.fileId ? { answerPicture: pictureOf(matched) } : {}),
              ...(matched?.$?.narration
                ? { answerNarration: matched.$.narration }
                : {}),
            };
          }),
        distractors: parts
          .filter((part) => part.type === "question-answer" && written(part))
          .map((extra) => ({
            id: extra.optionId ?? "",
            text: textOf(extra).trim(),
            ...(extra.fileId ? { picture: pictureOf(extra) } : {}),
            ...voiceOf(extra),
          })),
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
        ...(node.bank
          ? {
              bank: node.bank
                .map((word) => word.trim())
                .filter((word) => word !== ""),
            }
          : {}),
      };
    case "highlight":
      return {
        ...check,
        type: "highlight",
        segments: segmentsOf(
          parts.filter((part) => part.type === "question-passage"),
        ).map((segment) =>
          segment.type === "gap"
            ? {
                type: "target",
                id: segment.id,
                text: segment.answers[0] ?? "",
              }
            : segment,
        ),
      };
    case "sorting": {
      const groups = parts.filter((part) => part.type === "question-group");
      return {
        ...check,
        type: "sorting",
        groups: groups.map((group) => ({
          id: group.optionId ?? "",
          name: textOf(group.children?.[0]).trim(),
          ...voiceOf(group.children?.[0]),
        })),
        items: groups.flatMap((group) =>
          (group.children ?? [])
            .filter((item) => item.type === "question-option" && written(item))
            .map((item) => ({
              id: item.optionId ?? "",
              text: textOf(item).trim(),
              ...(item.fileId ? { picture: pictureOf(item) } : {}),
              ...voiceOf(item),
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
        requires: child.requires ?? "above",
      });
      continue;
    }
    if (child.type === "draw") {
      flush();
      if (child.questionId)
        blocks.push({
          id: child.questionId,
          type: "draw",
          tag: child.bankTag?.trim() ?? "",
          count: child.count ?? 1,
          points: child.points ?? 1,
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
  node.type === "question" || node.type === "draw" || node.type === "gate";

/** Whether a document asks questions of its own, or draws them from the bank. */
export function holdsQuestions(document: ContentDocument): boolean {
  return (document.root.children ?? []).some(
    (node) => node.type === "question" || node.type === "draw",
  );
}

/**
 * A question drawn from the bank as one attempt asks it, worth what its draw
 * gives each. Its id comes from the draw and the kept question, so every
 * student who drew it answers the same question, marked together.
 */
export function drawnQuestion(
  draw: DrawBlock,
  bankQuestionId: string,
  node: ContentNode,
): CheckBlock | null {
  const block = questionBlock(node);
  if (!block || !isCheck(block)) return null;
  const { videoAt: _videoAt, ...asked } = block;
  if (asked.type === "poll")
    return { ...asked, id: runId(`draw:${draw.id}:${bankQuestionId}`) };
  return {
    ...asked,
    id: runId(`draw:${draw.id}:${bankQuestionId}`),
    points: draw.points,
  };
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
      if (block.type === "gate")
        return other?.type === "gate" && other.requires === block.requires;
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
  return {
    ...paragraphOf(""),
    type,
    children: mathRuns(text).flatMap((run): ContentNode[] =>
      "latex" in run
        ? [
            {
              type: "math",
              version: 1,
              latex: run.latex,
              ...(run.block ? { block: true } : {}),
            },
          ]
        : (paragraphOf(run.text).children ?? []),
    ),
  };
}

/** A part whose text keeps its line breaks, as a test's input and output do. */
function linesOf(type: ContentNode["type"], text: string): ContentNode {
  return {
    ...inlineOf(type, ""),
    children: text
      .split("\n")
      .flatMap((line, index): ContentNode[] => [
        ...(index > 0
          ? [{ type: "linebreak" as const, version: 1 as const }]
          : []),
        ...(paragraphOf(line).children ?? []),
      ]),
  };
}

function gapNode(segment: Extract<GapSegment, { type: "gap" }>): ContentNode {
  return {
    ...inlineOf("question-gap", gapsSource([segment]).slice(1, -1)),
    optionId: segment.id,
  };
}

/** A highlight question's passage, each word to find in a gap of its own. */
function targetPassagesOf(segments: HighlightBlock["segments"]): ContentNode[] {
  return passagesOf(
    segments.map((segment) =>
      segment.type === "target"
        ? { type: "gap", id: segment.id, answers: [segment.text], options: [] }
        : segment,
    ),
  );
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
    block.type !== "poll" &&
    block.type !== "text" &&
    block.type !== "math" &&
    block.type !== "written" &&
    block.type !== "number" &&
    block.type !== "ordering" &&
    block.type !== "matching" &&
    block.type !== "sorting" &&
    block.type !== "gaps" &&
    block.type !== "highlight" &&
    block.type !== "counting" &&
    block.type !== "tracing" &&
    block.type !== "spelling" &&
    block.type !== "hotspot" &&
    block.type !== "labelling" &&
    block.type !== "crossword" &&
    block.type !== "scratch" &&
    block.type !== "project" &&
    block.type !== "puzzle" &&
    block.type !== "parsons" &&
    block.type !== "program"
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
    ...(block.feedbackAt && block.feedbackAt !== "now"
      ? { feedbackAt: block.feedbackAt }
      : {}),
    ...(block.hints.length > 0 ? { hints: block.hints } : {}),
    explanation: block.explanation,
    ...(typeof block.videoAt === "number" ? { videoAt: block.videoAt } : {}),
    ...(block.standards?.length ? { standards: block.standards } : {}),
    ...voiced(block.narration, block.narrationWords),
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
          ...pictureFields(option.picture),
          ...voiced(option.narration),
          optionId: option.id,
          correct: block.correctOptionIds.includes(option.id),
          feedback: option.feedback,
        })),
      ],
    };
  if (block.type === "poll")
    return {
      ...base,
      multiple: block.multiple,
      classResults: block.classResults,
      children: [
        ...(base.children ?? []),
        ...block.options.map((option) => ({
          ...inlineOf("question-option", option.text),
          ...pictureFields(option.picture),
          ...voiced(option.narration),
          optionId: option.id,
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
  if (block.type === "math")
    return {
      ...base,
      tolerance: block.tolerance,
      children: [
        ...(base.children ?? []),
        ...block.answers.map((latex) =>
          inlineOf("question-answer", mathText({ latex })),
        ),
      ],
    };
  if (block.type === "gaps")
    return {
      ...base,
      caseSensitive: block.caseSensitive,
      closeEnough: block.closeEnough,
      tehMarbuta: block.tehMarbuta,
      ...(block.bank ? { bank: block.bank } : {}),
      children: [...(base.children ?? []), ...passagesOf(block.segments)],
    };
  if (block.type === "highlight")
    return {
      ...base,
      children: [...(base.children ?? []), ...targetPassagesOf(block.segments)],
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
      ...(block.line ? { line: block.line } : {}),
    };
  if (block.type === "ordering")
    return {
      ...base,
      scoring: block.scoring,
      children: [
        ...(base.children ?? []),
        ...block.items.map((item) => ({
          ...inlineOf("question-option", item.text),
          ...pictureFields(item.picture),
          ...voiced(item.narration),
          optionId: item.id,
        })),
      ],
    };
  if (block.type === "parsons")
    return {
      ...base,
      codeLanguage: block.language,
      children: [
        ...(base.children ?? []),
        ...block.lines.map((line) => ({
          ...inlineOf(
            "question-option",
            `${"    ".repeat(line.indent)}${line.code}`,
          ),
          optionId: line.id,
        })),
        ...block.distractors.map((line) => ({
          ...inlineOf("question-option", line.code),
          optionId: line.id,
          correct: true,
        })),
      ],
    };
  if (block.type === "program")
    return {
      ...base,
      codeLanguage: block.language,
      children: [
        ...(base.children ?? []),
        // The starter's lines carry no ids of their own; the program is
        // read back from their text alone.
        ...(block.starter ? block.starter.split("\n") : [""]).map((line) => ({
          ...inlineOf("question-option", line),
          optionId: crypto.randomUUID(),
        })),
        ...block.tests.map((test): ContentNode => ({
          type: "question-pair",
          version: 1,
          format: "",
          indent: 0,
          direction: null,
          optionId: test.id,
          ...(test.hidden ? { hidden: true } : {}),
          children: [
            linesOf("question-side", test.input),
            linesOf("question-side", test.expected),
          ],
        })),
      ],
    };
  if (block.type === "matching")
    return {
      ...base,
      ...(block.memory ? { memory: true } : {}),
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
            {
              ...inlineOf("question-side", pair.prompt),
              ...pictureFields(pair.promptPicture),
              ...voiced(pair.promptNarration),
            },
            {
              ...inlineOf("question-side", pair.answer),
              ...pictureFields(pair.answerPicture),
              ...voiced(pair.answerNarration),
            },
          ],
        })),
        ...block.distractors.map((extra) => ({
          ...inlineOf("question-answer", extra.text),
          ...pictureFields(extra.picture),
          ...voiced(extra.narration),
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
            {
              ...inlineOf("question-side", group.name),
              ...voiced(group.narration),
            },
            ...block.items
              .filter((item) => item.groupId === group.id)
              .map((item) => ({
                ...inlineOf("question-option", item.text),
                ...pictureFields(item.picture),
                ...voiced(item.narration),
                optionId: item.id,
              })),
          ],
        })),
      ],
    };
  if (block.type === "tracing") return { ...base, trace: block.strokes };
  if (block.type === "scratch")
    return {
      ...base,
      ...(block.starter ? { projectFileId: block.starter.fileId } : {}),
      ...(block.gallery ? { gallery: true } : {}),
      ...(block.checks.length > 0 ? { projectChecks: block.checks } : {}),
    };
  if (block.type === "project")
    return {
      ...base,
      ...(block.files.length > 0 ? { projectFiles: block.files } : {}),
      ...(block.gallery ? { gallery: true } : {}),
      ...(block.language === "web" ? {} : { projectLanguage: block.language }),
    };
  if (block.type === "puzzle") return { ...base, puzzle: block.level };
  if (block.type === "hotspot")
    return {
      ...base,
      ...pictureFields(block.picture),
      places: block.places.map((place) => ({
        box: [...place.box],
        name: place.name,
        correct: place.correct,
      })),
    };
  if (block.type === "crossword")
    return {
      ...base,
      children: [
        ...(base.children ?? []),
        ...block.words.map((word): ContentNode => ({
          type: "question-pair",
          version: 1,
          format: "",
          indent: 0,
          direction: null,
          optionId: word.id,
          children: [
            inlineOf("question-side", word.answer),
            inlineOf("question-side", word.clue),
          ],
        })),
      ],
    };
  if (block.type === "labelling")
    return {
      ...base,
      ...pictureFields(block.picture),
      places: block.places.map((place) => ({
        box: [...place.box],
        name: place.name,
        correct: true,
      })),
      ...(block.extras.length > 0 ? { bank: block.extras } : {}),
    };
  if (block.type === "spelling")
    return {
      ...base,
      ...pictureFields(block.picture),
      children: [
        ...(base.children ?? []),
        inlineOf("question-answer", block.tiles.join(" ")),
        ...(block.extras.length
          ? [inlineOf("question-answer", block.extras.join(" "))]
          : []),
      ],
    };
  if (block.type === "counting")
    return {
      ...base,
      ...pictureFields(block.picture),
      count: block.count,
      countMode: block.mode,
      countLayout: block.layout,
      flashSeconds: block.flashSeconds,
    };
  return {
    ...base,
    wordLimit: block.wordLimit,
    ...(block.recordSeconds ? { recordSeconds: block.recordSeconds } : {}),
    ...(block.recordSeconds && block.recordVideo ? { recordVideo: true } : {}),
    ...(block.answerWith ? { answerWith: block.answerWith } : {}),
  };
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
      children.push({
        type: "gate",
        version: 1,
        ...(block.requires === "above" ? {} : { requires: block.requires }),
      });
      continue;
    }
    if (block.type === "draw") {
      children.push({
        type: "draw",
        version: 1,
        questionId: block.id,
        bankTag: block.tag,
        count: block.count,
        points: block.points,
      });
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
