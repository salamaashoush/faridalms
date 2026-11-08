import * as v from "valibot";

import type { ContentDocument, ContentNode } from "./content";

import { contentDocumentSchema } from "./content";
import {
  lessonBlockSchema,
  MAX_ACCEPTED_ANSWERS,
  MAX_CHOICE_OPTIONS,
  MAX_GAPS,
  MAX_ORDER_ITEMS,
  MAX_PAIRS,
} from "./learning";
import { contentOfLesson } from "./lesson-content";
import { CONTENT_LOCALES } from "./translations";

/** The language model services a school may choose, each behind its own adapter. */
export const ASSISTANT_PROVIDERS = ["anthropic"] as const;
export type AssistantProviderId = (typeof ASSISTANT_PROVIDERS)[number];

/** How a provider is named to the people whose words go to it. */
export const PROVIDER_NAMES: Record<AssistantProviderId, string> = {
  anthropic: "Anthropic Claude",
};

/** What a teacher may ask of the model. Nothing else is ever sent. */
export const ASSISTANT_TASKS = ["questions", "level", "translate"] as const;
export type AssistantTask = (typeof ASSISTANT_TASKS)[number];

/**
 * The records whose words a teacher may send: documents staff write for
 * their classes. Work students hand in, their answers, messages and
 * anything a family writes are never among them.
 */
export const ASSISTANT_HOSTS = ["lesson", "assignment"] as const;
export type AssistantHost = (typeof ASSISTANT_HOSTS)[number];

/** The stages a text can be rewritten for, youngest first. */
export const READING_LEVELS = [
  "early",
  "lower_primary",
  "upper_primary",
  "lower_secondary",
  "upper_secondary",
] as const;
export type ReadingLevel = (typeof READING_LEVELS)[number];

/** How many questions a teacher may ask for at once, few enough to read each. */
export const QUESTION_COUNTS = [3, 5, 10] as const;

/** The most words, in characters, one request may carry to the provider. */
export const MAX_ASSISTANT_CHARACTERS = 40_000;

/** Requests a school starts with each day, until its administrators say otherwise. */
export const DEFAULT_DAILY_LIMIT = 100;

const id = v.pipe(v.string(), v.uuid());

export const assistantSettingsSchema = v.object({
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
  enabled: v.boolean(),
  provider: v.picklist(ASSISTANT_PROVIDERS),
  dailyLimit: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(10_000),
  ),
});
export type AssistantSettingsInput = v.InferOutput<
  typeof assistantSettingsSchema
>;

const host = v.object({ type: v.picklist(ASSISTANT_HOSTS), id });
const language = v.picklist(CONTENT_LOCALES);

/**
 * One request to the model, as the editor sends it: the document, or the
 * part of it the teacher selected, and what to do with it. The server
 * builds the prompt from it alone, after taking out everything that is not
 * the teacher's own words.
 */
export const assistantRunSchema = v.variant("task", [
  v.object({
    task: v.literal("questions"),
    host,
    content: contentDocumentSchema,
    language,
    count: v.picklist(QUESTION_COUNTS),
  }),
  v.object({
    task: v.literal("level"),
    host,
    content: contentDocumentSchema,
    language,
    level: v.picklist(READING_LEVELS),
  }),
  v.object({
    task: v.literal("translate"),
    host,
    content: contentDocumentSchema,
    title: v.pipe(v.string(), v.maxLength(200)),
    from: language,
  }),
]);
export type AssistantRun = v.InferOutput<typeof assistantRunSchema>;

/** The kinds of question the model may propose, each an existing kind of block. */
export const PROPOSED_KINDS = [
  "choice",
  "multiple",
  "text",
  "written",
  "ordering",
  "matching",
  "gaps",
] as const;
export type ProposedKind = (typeof PROPOSED_KINDS)[number];

/** A question as the model proposes it, before it becomes a block. */
export interface QuestionProposal {
  kind: ProposedKind;
  prompt: string;
  options: { text: string; correct: boolean }[];
  answers: string[];
  items: string[];
  pairs: { prompt: string; answer: string }[];
  passage: string;
  explanation: string;
}

const proposalSchema = v.object({
  kind: v.picklist(PROPOSED_KINDS),
  prompt: v.string(),
  options: v.array(v.object({ text: v.string(), correct: v.boolean() })),
  answers: v.array(v.string()),
  items: v.array(v.string()),
  pairs: v.array(v.object({ prompt: v.string(), answer: v.string() })),
  passage: v.string(),
  explanation: v.string(),
});

/** What a run sends back as it goes, one JSON object a line. */
export type AssistantEvent =
  /** The request was accepted; the school may make this many more today. */
  | { type: "started"; remaining: number }
  /** The provider asked us to wait before sending, for this many seconds. */
  | { type: "waiting"; seconds: number }
  /** Words of a rewritten text, as they arrive. */
  | { type: "text"; text: string }
  | { type: "question"; question: QuestionProposal; node: ContentNode }
  /** How many of a translation's passages have come back. */
  | { type: "progress"; done: number; total: number }
  | { type: "levelled"; paragraphs: string[] }
  | { type: "translated"; content: ContentDocument; title: string }
  | { type: "done" }
  | { type: "error"; code: string };

/**
 * Whether a document holds a student's own work. The editor offers the
 * declaration of AI use only in work a student hands in, so a document
 * carrying one is refused whatever record it claims to belong to.
 */
export function holdsStudentWork(document: ContentDocument): boolean {
  const pending = [document.root];
  for (let node = pending.shift(); node; node = pending.shift()) {
    if (node.type === "ai-use") return true;
    if (node.children) pending.push(...node.children);
  }
  return false;
}

/**
 * Parts never sent: answer keys, code, formulas, every kind of file, picture
 * and embed (whose names, descriptions and addresses can name a child),
 * mentions of people, and what only shapes the document.
 */
const NEVER_SENT = new Set<string>([
  "question-answer",
  "question-gap",
  "code",
  "code-highlight",
  "mention",
  "math",
  "ai-use",
  "image",
  "gallery",
  "compare",
  "chart",
  "file",
  "media",
  "embed",
  "lti",
  "cmi5",
  "diagram",
  "draw",
  "shared",
  "standards",
  "gate",
  "glossary",
  "bibliography",
  "footnote",
]);

/** Question kinds whose options, sides and passages are words a reader is shown. */
const WORDED_KINDS = new Set([
  "choice",
  "poll",
  "text",
  "math",
  "written",
  "number",
  "ordering",
  "matching",
  "sorting",
  "gaps",
  "counting",
]);

/** Elements whose words stand as a block of their own. */
const BLOCKS = new Set([
  "paragraph",
  "heading",
  "quote",
  "listitem",
  "toggle-title",
  "panel-title",
]);

const inlineText = (node: ContentNode): string => {
  if (NEVER_SENT.has(node.type)) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "linebreak") return "\n";
  if (node.type === "tab") return " ";
  return (node.children ?? []).map(inlineText).join("");
};

/**
 * The teacher's own words in a document, block by block in reading order,
 * leaving out its questions and everything never sent.
 */
export function teacherWords(document: ContentDocument): string[] {
  const found: string[] = [];
  const walk = (node: ContentNode) => {
    if (NEVER_SENT.has(node.type) || node.type === "question") return;
    const children = node.children ?? [];
    if (BLOCKS.has(node.type)) {
      // A list inside an item is items of its own, read after it.
      const words = children
        .filter((child) => child.type !== "list")
        .map(inlineText)
        .join("")
        .trim();
      if (words) found.push(words);
      for (const child of children) if (child.type === "list") walk(child);
      return;
    }
    for (const child of children) walk(child);
  };
  walk(document.root);
  return found;
}

/** What the document's questions already ask, so the model asks something else. */
export function askedPrompts(document: ContentDocument): string[] {
  const found: string[] = [];
  for (const node of document.root.children ?? []) {
    if (node.type !== "question") continue;
    const prompt = node.children?.find(
      (child) => child.type === "question-prompt",
    );
    const words = prompt ? inlineText(prompt).trim() : "";
    if (words) found.push(words);
  }
  return found;
}

type Path = (string | number)[];

/**
 * A passage of a document to translate: a run of text nodes side by side in
 * one element, from `from` up to `to`, sent as its words with each node's
 * part tagged so its formatting can be put back; or a word attribute of a
 * node (a question's explanation, a hint, an option's feedback).
 */
export type TranslationUnit =
  | { kind: "run"; parent: Path; from: number; to: number; text: string }
  | { kind: "value"; path: Path; text: string };

const tagged = (texts: string[]) =>
  texts.length === 1
    ? (texts[0] ?? "")
    : texts.map((text, index) => `<t${index}>${text}</t${index}>`).join("");

/**
 * Everything in a document a translation rewrites, in reading order: the
 * words of its text and of its questions' prompts, options, sides and
 * passages, and their explanations, hints and feedback. Answers, gaps,
 * code, formulas, files and mentions stay as the original has them.
 */
export function translationUnits(document: ContentDocument): TranslationUnit[] {
  const units: TranslationUnit[] = [];
  const walk = (node: ContentNode, path: Path, kind: string | null) => {
    if (NEVER_SENT.has(node.type)) return;
    const question = node.type === "question" ? (node.kind ?? "") : kind;
    if (
      question !== null &&
      !WORDED_KINDS.has(question) &&
      (node.type === "question-option" ||
        node.type === "question-side" ||
        node.type === "question-passage" ||
        node.type === "question-pair" ||
        node.type === "question-group")
    )
      return;
    if (node.type === "question") {
      if (node.explanation?.trim())
        units.push({
          kind: "value",
          path: [...path, "explanation"],
          text: node.explanation,
        });
      for (const [index, hint] of (node.hints ?? []).entries())
        if (hint.trim())
          units.push({
            kind: "value",
            path: [...path, "hints", index],
            text: hint,
          });
    }
    if (node.type === "question-option" && node.feedback?.trim())
      units.push({
        kind: "value",
        path: [...path, "feedback"],
        text: node.feedback,
      });
    const children = node.children ?? [];
    let start = -1;
    const close = (end: number) => {
      if (start < 0) return;
      const texts = children.slice(start, end).map((child) => child.text ?? "");
      if (texts.join("").trim())
        units.push({
          kind: "run",
          parent: [...path, "children"],
          from: start,
          to: end,
          text: tagged(texts),
        });
      start = -1;
    };
    for (const [index, child] of children.entries()) {
      if (child.type === "text") {
        if (start < 0) start = index;
        continue;
      }
      close(index);
      walk(child, [...path, "children", index], question);
    }
    close(children.length);
  };
  walk(document.root, ["root"], null);
  return units;
}

const TAG = /<t(\d+)>([\s\S]*?)<\/t\1>/g;

/** A translated run back into text nodes, each part in the format its original had. */
function runOf(originals: ContentNode[], translated: string): ContentNode[] {
  const [first] = originals;
  if (!first) return [];
  if (originals.length === 1) return [{ ...first, text: translated }];
  const parts = [...translated.matchAll(TAG)];
  if (parts.length === 0)
    return [{ ...first, text: translated.replaceAll(/<\/?t\d+>/g, "") }];
  return parts.flatMap(([, index, text]) => {
    const original = originals[Number(index)] ?? first;
    return text ? [{ ...original, text }] : [];
  });
}

function at(root: unknown, path: Path): unknown {
  let current = root;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

/**
 * A copy of a document with its units' words replaced by their
 * translations, by the unit's position in the list; a unit with no
 * translation keeps the original's words.
 */
export function withTranslations(
  document: ContentDocument,
  units: readonly TranslationUnit[],
  translations: ReadonlyMap<number, string>,
): ContentDocument {
  const copy = structuredClone(document);
  // From the end, so a run that becomes more or fewer nodes leaves the
  // positions of those before it in the same element as they were.
  const order = units.map((unit, index) => ({ unit, index })).toReversed();
  for (const { unit, index } of order) {
    const translated = translations.get(index);
    if (translated === undefined || !translated.trim()) continue;
    if (unit.kind === "value") {
      const parent = at(copy, unit.path.slice(0, -1));
      const key = unit.path.at(-1);
      if (parent && typeof parent === "object" && key !== undefined)
        (parent as Record<string | number, unknown>)[key] = translated;
      continue;
    }
    const children = at(copy, unit.parent);
    if (!Array.isArray(children)) continue;
    const nodes = children as ContentNode[];
    nodes.splice(
      unit.from,
      unit.to - unit.from,
      ...runOf(nodes.slice(unit.from, unit.to), translated),
    );
  }
  return copy;
}

/**
 * Names taken out of words before they leave, each replaced by a token the
 * model is told to keep, and put back in what comes back.
 */
export interface NameGuard {
  hide: (text: string) => string;
  restore: (text: string) => string;
}

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Hides the names given, longest first so a full name goes before the
 * shorter one inside it, matched as whole words in any case.
 */
export function nameGuard(names: readonly string[]): NameGuard {
  const unique = [
    ...new Set(
      names
        .map((name) => name.trim().replaceAll(/\s+/g, " "))
        .filter((name) => name.length >= 3),
    ),
  ].toSorted((one, other) => other.length - one.length);
  const tokenOf = new Map(
    unique.map((name, index) => [
      name.toLocaleLowerCase(),
      `[[P${index + 1}]]`,
    ]),
  );
  const nameOf = new Map(
    unique.map((name, index) => [`[[P${index + 1}]]`, name]),
  );
  const pattern =
    unique.length > 0
      ? new RegExp(
          `(?<![\\p{L}\\p{N}])(?:${unique
            .map((name) => escapeRegExp(name).replaceAll(" ", "\\s+"))
            .join("|")})(?![\\p{L}\\p{N}])`,
          "giu",
        )
      : null;
  return {
    hide: (text) =>
      pattern
        ? text.replace(
            pattern,
            (found) =>
              tokenOf.get(found.replaceAll(/\s+/g, " ").toLocaleLowerCase()) ??
              found,
          )
        : text,
    restore: (text) =>
      text.replaceAll(/\[\[P\d+\]\]/g, (token) => nameOf.get(token) ?? ""),
  };
}

/**
 * Items of a JSON array under a top-level key, given as the text of the
 * whole object grows: each item is handed over once it is complete, so a
 * proposal shows before the model has finished the rest.
 */
export class StreamedItems {
  private text = "";
  private position = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private started = false;
  private itemStart = -1;

  constructor(private readonly key: string) {}

  push(chunk: string): unknown[] {
    this.text += chunk;
    const found: unknown[] = [];
    if (!this.started) {
      const opening = new RegExp(`"${this.key}"\\s*:\\s*\\[`).exec(this.text);
      if (!opening) return found;
      this.started = true;
      this.position = opening.index + opening[0].length;
      this.depth = 0;
    }
    for (; this.position < this.text.length; this.position += 1) {
      const char = this.text[this.position];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (char === "\\") this.escaped = true;
        else if (char === '"') this.inString = false;
        continue;
      }
      if (char === '"') this.inString = true;
      else if (char === "{" || char === "[") {
        if (this.depth === 0) this.itemStart = this.position;
        this.depth += 1;
      } else if (char === "}" || char === "]") {
        if (this.depth === 0) {
          this.position = this.text.length;
          break;
        }
        this.depth -= 1;
        if (this.depth === 0 && this.itemStart >= 0) {
          try {
            found.push(
              JSON.parse(this.text.slice(this.itemStart, this.position + 1)),
            );
          } catch {
            // A malformed item is left out; the rest still come.
          }
          this.itemStart = -1;
        }
      }
    }
    return found;
  }
}

/** A proposal as the model wrote it, or null when it is not one. */
export function readProposal(value: unknown): QuestionProposal | null {
  const result = v.safeParse(proposalSchema, value);
  return result.success ? result.output : null;
}

const trimmed = (texts: readonly string[], max: number) =>
  texts
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, max);

/** A passage written with its answers in double brackets, as the gaps it asks to fill. */
function gapSegments(passage: string, newId: () => string) {
  const segments: (
    | { type: "text"; text: string }
    | { type: "gap"; id: string; answers: string[]; options: string[] }
  )[] = [];
  let last = 0;
  for (const match of passage.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const answer = match[1]?.trim() ?? "";
    segments.push({ type: "text", text: passage.slice(last, match.index) });
    if (answer)
      segments.push({
        type: "gap",
        id: newId(),
        answers: [answer],
        options: [],
      });
    last = match.index + match[0].length;
  }
  segments.push({ type: "text", text: passage.slice(last) });
  return segments;
}

function blockOf(
  proposal: QuestionProposal,
  newId: () => string,
): Record<string, unknown> | null {
  const common = {
    id: newId(),
    prompt: proposal.prompt.trim(),
    points: 1,
    hints: [],
    explanation: proposal.explanation.trim(),
    tries: null,
  };
  switch (proposal.kind) {
    case "choice":
    case "multiple": {
      const options = proposal.options
        .filter((option) => option.text.trim())
        .slice(0, MAX_CHOICE_OPTIONS)
        .map((option) => ({
          id: newId(),
          text: option.text.trim(),
          feedback: "",
          correct: option.correct,
        }));
      return {
        ...common,
        type: "choice",
        options: options.map(({ correct: _correct, ...option }) => option),
        correctOptionIds: options
          .filter((option) => option.correct)
          .map((option) => option.id),
        multiple: proposal.kind === "multiple",
        shuffle: true,
      };
    }
    case "text":
      return {
        ...common,
        type: "text",
        answers: trimmed(proposal.answers, MAX_ACCEPTED_ANSWERS),
        caseSensitive: false,
        closeEnough: true,
        tehMarbuta: true,
      };
    case "written":
      return { ...common, type: "written", wordLimit: null };
    case "ordering":
      return {
        ...common,
        type: "ordering",
        items: trimmed(proposal.items, MAX_ORDER_ITEMS).map((text) => ({
          id: newId(),
          text,
        })),
        scoring: "all",
      };
    case "matching":
      return {
        ...common,
        type: "matching",
        pairs: proposal.pairs
          .filter((pair) => pair.prompt.trim() && pair.answer.trim())
          .slice(0, MAX_PAIRS)
          .map((pair) => ({
            id: newId(),
            prompt: pair.prompt.trim(),
            answer: pair.answer.trim(),
          })),
        distractors: [],
      };
    case "gaps":
      break;
  }
  const segments = gapSegments(proposal.passage, newId);
  if (segments.filter((segment) => segment.type === "gap").length > MAX_GAPS)
    return null;
  return {
    ...common,
    type: "gaps",
    segments,
    caseSensitive: false,
    closeEnough: true,
    tehMarbuta: true,
  };
}

/**
 * A proposal as a question block of its kind, checked as any question the
 * teacher wrote is, or null when it does not make one.
 */
export function questionOfProposal(
  proposal: QuestionProposal,
  newId: () => string = () => crypto.randomUUID(),
): ContentNode | null {
  const block = blockOf(proposal, newId);
  if (!block) return null;
  const parsed = v.safeParse(lessonBlockSchema, block);
  if (!parsed.success) return null;
  const [node] =
    contentOfLesson({ version: 2, blocks: [parsed.output] })?.root.children ??
    [];
  return node ?? null;
}

/** A rewritten text as the paragraphs it was written in. */
export const paragraphsOf = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replaceAll(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
