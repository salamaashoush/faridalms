import * as v from "valibot";

import type { ContentDocument, ContentNode, QuestionKind } from "./content";
import type { LessonResponse } from "./learning";

import { parseNumber } from "./answers";
import { contentFileIds } from "./content";
import {
  choiceShape,
  numberSchema,
  responseIssue,
  responseSchema,
  textShape,
  writtenSchema,
} from "./learning";
import { questionBlock, questionNode } from "./lesson-content";

/**
 * What a place that asks questions decides about them: whether it marks the
 * answers, which kinds it asks, and whether a question may be required.
 * The question and its answer are the same everywhere; only these differ.
 */
export interface QuestionSurface {
  marked: boolean;
  kinds: readonly QuestionKind[];
  required: boolean;
}

/** The kinds a form asks a family: typed (or a day), written, a choice and a number. */
export const FORM_KINDS = ["text", "written", "choice", "number"] as const;
export type FormKind = (typeof FORM_KINDS)[number];

/** A form a family fills in: nothing is marked, and a question may be required. */
export const FORM_SURFACE: QuestionSurface = {
  marked: false,
  kinds: FORM_KINDS,
  required: true,
};

/** The longest answer a form keeps of each kind; a day is ten characters. */
const FORM_LIMITS = { text: 200, date: 10, number: 20, written: 2000 };

/** A question a form asks, read from its block with no key. */
export const formQuestionSchema = v.variant("type", [
  choiceShape,
  textShape,
  writtenSchema,
  numberSchema,
]);
export type FormQuestion = v.InferOutput<typeof formQuestionSchema>;

const isFormKind = (kind: string): kind is FormKind =>
  (FORM_KINDS as readonly string[]).includes(kind);

/**
 * A question block as a form asks it, or null when a form cannot: a kind
 * forms do not ask, a written answer spoken or drawn, or one not finished
 * (no words, or a choice of fewer than two options). A form has no key, so
 * any right option or accepted word a block carries is left out.
 */
function formQuestionOf(node: ContentNode): FormQuestion | null {
  const block = questionBlock(node);
  if (!block || !isFormKind(block.type)) return null;
  if (
    block.type === "written" &&
    (block.recordSeconds || block.answerWith || block.passage)
  )
    return null;
  const asked =
    block.type === "choice"
      ? { ...block, correctOptionIds: [] }
      : block.type === "text"
        ? { ...block, answers: [] }
        : block;
  const read = v.safeParse(formQuestionSchema, asked);
  return read.success ? read.output : null;
}

/** A form's document holding these questions, as the editor writes one. */
export function formDocument(
  questions: readonly FormQuestion[],
): ContentDocument {
  const nodes = questions.flatMap((question) => {
    const node = questionNode(question);
    return node ? [node] : [];
  });
  const blank: ContentNode = {
    type: "paragraph",
    version: 1,
    direction: null,
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
    children: [],
  };
  return {
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: nodes.length ? nodes : [blank],
    },
  };
}

/** The questions a form's document asks, in order. */
export function formQuestions(document: ContentDocument): FormQuestion[] {
  return (document.root.children ?? []).flatMap((node) => {
    const question = node.type === "question" ? formQuestionOf(node) : null;
    return question ? [question] : [];
  });
}

export type FormIssue = "kind" | "unfinished" | "files";

/**
 * What stops a form's document going to families: a block a form cannot
 * ask (a kind it does not take, a draw, a gate), a question with words but
 * not finished (a choice of fewer than two options), or a picture or file,
 * which a visitor who is not signed in cannot open.
 */
export function formIssue(document: ContentDocument): FormIssue | null {
  for (const node of document.root.children ?? []) {
    if (node.type === "draw" || node.type === "gate") return "kind";
    if (node.type !== "question") continue;
    if (!node.kind || !isFormKind(node.kind)) return "kind";
    if (
      node.kind === "written" &&
      (node.recordSeconds || node.answerWith || node.reading)
    )
      return "kind";
    // A question with no words yet is not asked, so it holds nothing up.
    const block = questionBlock(node);
    if (!formQuestionOf(node) && block && "prompt" in block && block.prompt)
      return "unfinished";
  }
  return contentFileIds(document).length > 0 ? "files" : null;
}

/** One answer a form keeps, in the words the family read when they gave it. */
export interface FormAnswer {
  id: string;
  kind: FormKind;
  prompt: string;
  response: LessonResponse;
  /** The answer as words: what was typed, or the options chosen. */
  text: string;
  /** A typed answer that is a day, `YYYY-MM-DD`. */
  date?: true;
}

export const formAnswerSchema = v.object({
  id: v.pipe(v.string(), v.maxLength(64)),
  kind: v.picklist(FORM_KINDS),
  prompt: v.pipe(v.string(), v.maxLength(1000)),
  response: responseSchema,
  text: v.pipe(v.string(), v.maxLength(FORM_LIMITS.written)),
  date: v.optional(v.literal(true)),
});

/** What a family sends for one question of a form. */
export const formResponsesSchema = v.pipe(
  v.record(v.pipe(v.string(), v.maxLength(64)), v.unknown()),
  v.check((answers) => Object.keys(answers).length <= 100),
);

/** The answer to a question as words: what was typed, or the options chosen. */
export function answerText(
  question: FormQuestion,
  response: LessonResponse,
): string {
  if (question.type === "choice" && response.type === "choice")
    return question.options
      .filter((option) => response.optionIds.includes(option.id))
      .map((option) => option.text || option.picture?.alt || "")
      .join(", ");
  return "text" in response ? response.text : "";
}

/** Whether a family left a question unanswered: nothing sent, or only spaces. */
function unanswered(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (typeof raw !== "object") return false;
  const sent = raw as { text?: unknown; optionIds?: unknown };
  if (Array.isArray(sent.optionIds)) return sent.optionIds.length === 0;
  return typeof sent.text === "string" && sent.text.trim() === "";
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function realDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value);
}

/** Whether a response fits a form's question beyond its kind's shape. */
function fitsForm(question: FormQuestion, response: LessonResponse): boolean {
  if (responseIssue(question, response)) return false;
  switch (response.type) {
    case "choice":
      return question.type === "choice" && question.multiple
        ? new Set(response.optionIds).size === response.optionIds.length
        : response.optionIds.length === 1;
    case "text":
      return question.type === "text" && question.date
        ? realDay(response.text)
        : response.text.length <= FORM_LIMITS.text;
    case "number":
      return (
        response.text.length <= FORM_LIMITS.number &&
        parseNumber(response.text) !== null
      );
    case "written":
      return (
        !response.recording &&
        !response.picture &&
        response.text.length <= FORM_LIMITS.written
      );
    default:
      return false;
  }
}

export type FormAnswersRead =
  | { ok: true; answers: FormAnswer[] }
  | { ok: false; questionId: string; code: "required" | "invalid" };

/**
 * A family's answers checked against the questions their form showed: each
 * the kind's response, a choice among its options, a day that exists, a
 * number that reads, within the form's lengths, and every required question
 * answered. Answers to questions the form does not ask are dropped, and
 * each keeps its question's words, so editing the form later never changes
 * what was sent.
 */
export function readFormAnswers(
  questions: readonly FormQuestion[],
  submitted: Readonly<Record<string, unknown>>,
): FormAnswersRead {
  const answers: FormAnswer[] = [];
  for (const question of questions) {
    const raw = submitted[question.id];
    if (unanswered(raw)) {
      if (question.required)
        return { ok: false, questionId: question.id, code: "required" };
      continue;
    }
    const read = v.safeParse(responseSchema, raw);
    if (!read.success || !fitsForm(question, read.output))
      return { ok: false, questionId: question.id, code: "invalid" };
    answers.push({
      id: question.id,
      kind: question.type,
      prompt: question.prompt,
      response: read.output,
      text: answerText(question, read.output),
      ...(question.type === "text" && question.date
        ? { date: true as const }
        : {}),
    });
  }
  return { ok: true, answers };
}

/**
 * What a form's inputs hold for a question as the response it takes: the
 * words typed, or the ids of the options chosen. Nothing for an input left
 * empty, so a question not answered is not sent.
 */
export function formResponse(
  question: FormQuestion,
  value: string | readonly string[],
): LessonResponse | undefined {
  const values = (typeof value === "string" ? [value] : value).filter(
    (each) => each.trim() !== "",
  );
  const [first] = values;
  if (first === undefined) return undefined;
  if (question.type === "choice")
    return { type: "choice", optionIds: [...values] };
  if (question.type === "written") return { type: "written", text: first };
  if (question.type === "number") return { type: "number", text: first };
  return { type: "text", text: first };
}

/** What a form's input shows of a response it was given before. */
export function formValue(
  question: FormQuestion,
  response: LessonResponse | undefined,
): string[] {
  if (!response || response.type !== question.type) return [];
  if (response.type === "choice") return response.optionIds;
  return "text" in response ? [response.text] : [];
}

/** The most a form's input takes for a question, for the input's own limit. */
export function answerLimit(question: FormQuestion): number {
  if (question.type === "text")
    return question.date ? FORM_LIMITS.date : FORM_LIMITS.text;
  if (question.type === "number") return FORM_LIMITS.number;
  return FORM_LIMITS.written;
}
