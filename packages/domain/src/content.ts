import * as v from "valibot";

import type { EmbedProvider } from "./embed";

import { embedProviders, isEmbedId } from "./embed";
import { isSafeContentUrl } from "./rich-text";

const nodeTypes = [
  "root",
  "paragraph",
  "text",
  "heading",
  "quote",
  "list",
  "listitem",
  "link",
  "autolink",
  "linebreak",
  "tab",
  "code",
  "code-highlight",
  "table",
  "tablerow",
  "tablecell",
  "horizontalrule",
  "callout",
  "toggle",
  "toggle-title",
  "toggle-content",
  "columns",
  "column",
  "image",
  "file",
  "media",
  "embed",
  "diagram",
  "question",
  "question-prompt",
  "question-option",
  "question-answer",
  "question-pair",
  "question-group",
  "question-side",
  "question-passage",
  "question-gap",
  "gate",
  "starter",
  "ai-use",
] as const;
/**
 * The questions a document can ask, each marked by the server from the
 * question's own nodes. More kinds join as their blocks are built.
 */
export const questionKinds = [
  "choice",
  "text",
  "written",
  "number",
  "ordering",
  "matching",
  "sorting",
  "gaps",
] as const;
export type QuestionKind = (typeof questionKinds)[number];
export const calloutTones = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
] as const;
export const columnLayouts = ["1:1", "1:2", "2:1", "1:1:1", "1:1:1:1"] as const;
export const imageSizes = ["small", "medium", "large", "full"] as const;
/** A file reads as a card, or a PDF also shows its pages in the document. */
export const fileDisplays = ["card", "preview"] as const;
export type FileDisplay = (typeof fileDisplays)[number];
export type CalloutTone = (typeof calloutTones)[number];
export type ColumnLayout = (typeof columnLayouts)[number];
export type ImageSize = (typeof imageSizes)[number];
export interface ContentNode {
  type: (typeof nodeTypes)[number];
  version: 1;
  children?: ContentNode[];
  text?: string;
  format?:
    | number
    | ""
    | "left"
    | "right"
    | "center"
    | "justify"
    | "start"
    | "end";
  indent?: number;
  direction?: "ltr" | "rtl" | null;
  style?: string;
  mode?: "normal" | "token" | "segmented";
  detail?: number;
  textFormat?: number;
  textStyle?: string;
  tag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "ul" | "ol";
  listType?: "bullet" | "number" | "check";
  start?: number;
  value?: number;
  checked?: boolean;
  url?: string;
  target?: "_blank" | "_self" | null;
  rel?: string | null;
  title?: string | null;
  isUnlinked?: boolean;
  language?: string;
  highlightType?: string | null;
  colSpan?: number;
  rowSpan?: number;
  headerState?: number;
  width?: number;
  height?: number;
  backgroundColor?: string | null;
  verticalAlign?: "top" | "middle" | "bottom";
  colWidths?: number[];
  rowStriping?: boolean;
  frozenColumnCount?: number;
  frozenRowCount?: number;
  tone?: CalloutTone;
  open?: boolean;
  layout?: ColumnLayout;
  fileId?: string;
  alt?: string;
  /** A picture that only decorates, so screen readers pass it by. */
  decorative?: boolean;
  caption?: string;
  size?: ImageSize;
  name?: string;
  mime?: string;
  bytes?: number;
  display?: FileDisplay;
  captionsFileId?: string;
  captionsLang?: string;
  transcript?: string;
  provider?: EmbedProvider;
  embedId?: string;
  sceneFileId?: string;
  kind?: QuestionKind;
  questionId?: string;
  optionId?: string;
  correct?: boolean;
  feedback?: string;
  points?: number;
  tries?: number | null;
  multiple?: boolean;
  shuffle?: boolean;
  caseSensitive?: boolean;
  closeEnough?: boolean;
  tehMarbuta?: boolean;
  wordLimit?: number | null;
  hint?: string;
  explanation?: string;
  numberMode?: "exact" | "range";
  answerValue?: number;
  tolerance?: number;
  percent?: boolean;
  rangeMin?: number;
  rangeMax?: number;
  scoring?: "all" | "neighbours";
  aiTool?: string;
  aiDate?: string;
  aiPrompt?: string;
  aiUse?: string;
  aiEvidence?: AiEvidence[];
  $?: { id?: string };
}

/** A screenshot or file a student keeps as evidence of using an AI tool. */
export interface AiEvidence {
  fileId: string;
  name: string;
  mime: string;
  bytes: number;
}
export interface ContentDocument {
  root: ContentNode;
}
const integer = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
const color = v.pipe(
  v.string(),
  v.regex(/^(#[\da-fA-F]{3,8}|transparent|black|white|red|blue|green|yellow)$/),
);
export function validContentStyle(style: string): boolean {
  return style.split(";").every((entry) => {
    if (!entry.trim()) return true;
    const [property, value, extra] = entry
      .split(":")
      .map((part) => part.trim());
    if (!property || !value || extra !== undefined) return false;
    if (property === "color" || property === "background-color")
      return v.safeParse(color, value).success;
    if (property === "font-size")
      return /^(?:[89]|[1-8]\d|9[0-6])px$/.test(value);
    if (property === "font-family")
      return ["Arial", "Georgia", "monospace", "sans-serif", "serif"].includes(
        value,
      );
    return false;
  });
}
const style = v.pipe(v.string(), v.maxLength(1024), v.check(validContentStyle));
const nodeSchema: v.GenericSchema<ContentNode> = v.lazy(() =>
  v.pipe(
    v.object({
      type: v.picklist(nodeTypes),
      version: v.literal(1),
      children: v.optional(v.array(nodeSchema)),
      text: v.optional(v.pipe(v.string(), v.maxLength(100000))),
      format: v.optional(
        v.union([
          integer(0, 2047),
          v.picklist([
            "",
            "left",
            "right",
            "center",
            "justify",
            "start",
            "end",
          ]),
        ]),
      ),
      indent: v.optional(integer(0, 20)),
      direction: v.optional(v.nullable(v.picklist(["ltr", "rtl"]))),
      style: v.optional(style),
      textStyle: v.optional(style),
      textFormat: v.optional(integer(0, 2047)),
      mode: v.optional(v.picklist(["normal", "token", "segmented"])),
      detail: v.optional(integer(0, 3)),
      tag: v.optional(
        v.picklist(["h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol"]),
      ),
      listType: v.optional(v.picklist(["bullet", "number", "check"])),
      start: v.optional(integer(1, 1000000)),
      value: v.optional(integer(1, 1000000)),
      checked: v.optional(v.boolean()),
      url: v.optional(
        v.pipe(v.string(), v.maxLength(2048), v.check(isSafeContentUrl)),
      ),
      target: v.optional(v.nullable(v.picklist(["_blank", "_self"]))),
      rel: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(255)))),
      title: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(1000)))),
      isUnlinked: v.optional(v.boolean()),
      language: v.optional(v.pipe(v.string(), v.maxLength(64))),
      highlightType: v.optional(
        v.nullable(v.pipe(v.string(), v.maxLength(64))),
      ),
      colSpan: v.optional(integer(1, 100)),
      rowSpan: v.optional(integer(1, 100)),
      headerState: v.optional(integer(0, 3)),
      width: v.optional(integer(1, 5000)),
      height: v.optional(integer(1, 5000)),
      backgroundColor: v.optional(v.nullable(color)),
      verticalAlign: v.optional(v.picklist(["top", "middle", "bottom"])),
      colWidths: v.optional(
        v.pipe(v.array(integer(1, 5000)), v.maxLength(100)),
      ),
      rowStriping: v.optional(v.boolean()),
      frozenColumnCount: v.optional(integer(0, 100)),
      frozenRowCount: v.optional(integer(0, 100)),
      tone: v.optional(v.picklist(calloutTones)),
      open: v.optional(v.boolean()),
      layout: v.optional(v.picklist(columnLayouts)),
      fileId: v.optional(v.pipe(v.string(), v.uuid())),
      alt: v.optional(v.pipe(v.string(), v.maxLength(500))),
      decorative: v.optional(v.boolean()),
      caption: v.optional(v.pipe(v.string(), v.maxLength(1000))),
      size: v.optional(v.picklist(imageSizes)),
      name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(255))),
      mime: v.optional(v.pipe(v.string(), v.maxLength(255))),
      bytes: v.optional(integer(0, 2147483647)),
      display: v.optional(v.picklist(fileDisplays)),
      captionsFileId: v.optional(v.pipe(v.string(), v.uuid())),
      captionsLang: v.optional(
        v.pipe(v.string(), v.regex(/^[a-z]{2,3}(?:-[\da-z]{2,8})*$/i)),
      ),
      transcript: v.optional(v.pipe(v.string(), v.maxLength(20000))),
      provider: v.optional(v.picklist(embedProviders)),
      embedId: v.optional(v.pipe(v.string(), v.maxLength(200))),
      sceneFileId: v.optional(v.pipe(v.string(), v.uuid())),
      kind: v.optional(v.picklist(questionKinds)),
      questionId: v.optional(v.pipe(v.string(), v.uuid())),
      optionId: v.optional(v.pipe(v.string(), v.uuid())),
      correct: v.optional(v.boolean()),
      feedback: v.optional(v.pipe(v.string(), v.maxLength(300))),
      points: v.optional(integer(0, 100)),
      tries: v.optional(v.nullable(integer(1, 10))),
      multiple: v.optional(v.boolean()),
      shuffle: v.optional(v.boolean()),
      caseSensitive: v.optional(v.boolean()),
      closeEnough: v.optional(v.boolean()),
      tehMarbuta: v.optional(v.boolean()),
      wordLimit: v.optional(v.nullable(integer(10, 5000))),
      hint: v.optional(v.pipe(v.string(), v.maxLength(500))),
      explanation: v.optional(v.pipe(v.string(), v.maxLength(1000))),
      numberMode: v.optional(v.picklist(["exact", "range"])),
      answerValue: v.optional(v.pipe(v.number(), v.finite())),
      tolerance: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0))),
      percent: v.optional(v.boolean()),
      rangeMin: v.optional(v.pipe(v.number(), v.finite())),
      rangeMax: v.optional(v.pipe(v.number(), v.finite())),
      scoring: v.optional(v.picklist(["all", "neighbours"])),
      aiTool: v.optional(v.pipe(v.string(), v.maxLength(200))),
      aiDate: v.optional(
        v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]),
      ),
      aiPrompt: v.optional(v.pipe(v.string(), v.maxLength(4000))),
      aiUse: v.optional(v.pipe(v.string(), v.maxLength(4000))),
      aiEvidence: v.optional(
        v.pipe(
          v.array(
            v.object({
              fileId: v.pipe(v.string(), v.uuid()),
              name: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
              mime: v.pipe(v.string(), v.maxLength(255)),
              bytes: integer(0, 2147483647),
            }),
          ),
          v.maxLength(20),
        ),
      ),
      $: v.optional(
        v.object({
          id: v.optional(v.pipe(v.string(), v.regex(/^[\da-z]{8,36}$/))),
        }),
      ),
    }),
    v.check(validNode),
  ),
);
const inline = (child: ContentNode) =>
  ["text", "code-highlight", "tab", "linebreak", "link", "autolink"].includes(
    child.type,
  );
const blocks = new Set<string>([
  "paragraph",
  "heading",
  "quote",
  "list",
  "code",
  "table",
  "horizontalrule",
  "callout",
  "toggle",
  "columns",
  "image",
  "file",
  "media",
  "embed",
  "diagram",
  "question",
  "gate",
  "starter",
  "ai-use",
]);
// Columns, questions, gates and each student's copy stand only at the top
// of a document.
const ROOT_ONLY = new Set(["columns", "question", "gate", "starter"]);
const nestedBlocks = new Set(
  [...blocks].filter((type) => !ROOT_ONLY.has(type)),
);
function validNode(node: ContentNode): boolean {
  const children = node.children ?? [];
  if (["text", "code-highlight", "tab"].includes(node.type))
    return (
      typeof node.text === "string" &&
      !node.children &&
      typeof node.format === "number"
    );
  if (["linebreak", "horizontalrule", "gate", "ai-use"].includes(node.type))
    return !node.children && node.text === undefined;
  if (node.type === "image")
    return !node.children && node.text === undefined && Boolean(node.fileId);
  if (node.type === "file")
    return (
      !node.children &&
      node.text === undefined &&
      Boolean(node.fileId) &&
      Boolean(node.name)
    );
  if (node.type === "media")
    return (
      !node.children &&
      node.text === undefined &&
      Boolean(node.fileId) &&
      /^(audio|video)\//.test(node.mime ?? "")
    );
  if (node.type === "embed")
    return (
      !node.children &&
      node.text === undefined &&
      node.provider !== undefined &&
      node.embedId !== undefined &&
      isEmbedId(node.provider, node.embedId)
    );
  if (node.type === "diagram")
    return (
      !node.children &&
      node.text === undefined &&
      Boolean(node.fileId) &&
      Boolean(node.sceneFileId)
    );
  if (
    !node.children ||
    node.text !== undefined ||
    typeof node.format === "number"
  )
    return false;

  switch (node.type) {
    case "question":
      // How complete a question is gets checked when its document is
      // published; a half-written one still saves.
      return (
        Boolean(node.kind && node.questionId) &&
        children[0]?.type === "question-prompt" &&
        children
          .slice(1)
          .every((child) =>
            [
              "question-option",
              "question-answer",
              "question-pair",
              "question-group",
              "question-passage",
            ].includes(child.type),
          )
      );
    case "question-prompt":
    case "question-answer":
    case "question-side":
      return children.every(inline);
    case "question-option":
      return Boolean(node.optionId) && children.every(inline);
    case "question-pair":
      return (
        Boolean(node.optionId) &&
        children.length === 2 &&
        children.every((child) => child.type === "question-side")
      );
    case "question-passage":
      return children.every(
        (child) => inline(child) || child.type === "question-gap",
      );
    case "question-gap":
      return (
        Boolean(node.optionId) &&
        children.every((child) => child.type === "text")
      );
    case "question-group":
      return (
        Boolean(node.optionId) &&
        children[0]?.type === "question-side" &&
        children.slice(1).every((child) => child.type === "question-option")
      );
    case "root":
      return children.every((child) => blocks.has(child.type));
    case "quote":
      return children.every(
        (child) =>
          inline(child) ||
          ["paragraph", "heading", "quote", "list", "horizontalrule"].includes(
            child.type,
          ),
      );
    case "paragraph":
    case "code":
    case "toggle-title":
      return children.every(inline);
    case "heading":
      return Boolean(node.tag?.startsWith("h")) && children.every(inline);
    case "link":
    case "autolink":
      return (
        Boolean(node.url) &&
        children.every(
          (child) =>
            inline(child) && !["link", "autolink"].includes(child.type),
        )
      );
    case "list":
      return (
        Boolean(node.listType) &&
        children.every((child) => child.type === "listitem")
      );
    case "listitem":
      return children.every((child) => inline(child) || child.type === "list");
    case "table":
      return (
        children.length > 0 &&
        children.every((child) => child.type === "tablerow")
      );
    case "tablerow":
      return (
        children.length > 0 &&
        children.every((child) => child.type === "tablecell")
      );
    case "tablecell":
      return children.every((child) =>
        ["paragraph", "heading", "quote", "list", "code"].includes(child.type),
      );
    case "starter":
      return (
        children.length > 0 &&
        children.every((child) => nestedBlocks.has(child.type))
      );
    case "callout":
      return (
        children.length > 0 &&
        children.every(
          (child) => child.type !== "callout" && nestedBlocks.has(child.type),
        )
      );
    case "toggle":
      return (
        children.length === 2 &&
        children[0]?.type === "toggle-title" &&
        children[1]?.type === "toggle-content"
      );
    case "toggle-content":
    case "column":
      return (
        children.length > 0 &&
        children.every((child) => nestedBlocks.has(child.type))
      );
    case "columns":
      return (
        children.length >= 2 &&
        children.length <= 4 &&
        children.every((child) => child.type === "column")
      );
  }
  return false;
}
function boundedContent(value: unknown): boolean {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const next = pending.pop();
    if (!next || next.depth > 32 || ++nodes > 10000) return false;
    if (typeof next.value !== "object" || next.value === null) continue;
    if ("root" in next.value)
      pending.push({ value: next.value.root, depth: next.depth + 1 });
    if ("children" in next.value && Array.isArray(next.value.children)) {
      for (const child of next.value.children)
        pending.push({ value: child, depth: next.depth + 1 });
    }
  }
  return true;
}
export const contentDocumentSchema = v.pipe(
  v.custom<ContentDocument>(boundedContent),
  v.object({ root: nodeSchema }),
  v.check(
    (document) =>
      document.root.type === "root" &&
      contentPlainText(document).length <= 100000,
  ),
);
const blockSeparated = new Set<string>([
  "root",
  "question",
  "question-pair",
  "question-group",
  "list",
  "table",
  "tablerow",
  "callout",
  "toggle",
  "toggle-content",
  "columns",
  "column",
]);
const visit = (node: ContentNode): string => {
  if (node.type === "image" || node.type === "diagram")
    return node.caption || node.alt || "";
  if (node.type === "media")
    return [node.caption, node.transcript].filter(Boolean).join("\n");
  if (node.type === "embed") return node.caption ?? "";
  if (node.type === "file") return node.name ?? "";
  // Accepted answers are the key; they stay out of text anyone can search.
  if (node.type === "question-answer" || node.type === "question-gap")
    return "";
  return (
    node.text ??
    (node.type === "linebreak"
      ? "\n"
      : (node.children ?? [])
          .map(visit)
          .join(blockSeparated.has(node.type) ? "\n" : ""))
  );
};
export function contentPlainText(document: ContentDocument): string {
  return visit(document.root);
}

const STRONG_RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
const STRONG = /[\p{L}]/u;

/**
 * The direction a text reads in, from its first letter: Arabic or Hebrew make
 * it right to left, any other script left to right. Digits and punctuation
 * decide nothing, so a text without letters has no direction of its own.
 */
export function textDirection(text: string): "ltr" | "rtl" | null {
  for (const character of text) {
    if (STRONG_RTL.test(character)) return "rtl";
    if (STRONG.test(character)) return "ltr";
  }
  return null;
}
export function contentFileIds(document: ContentDocument): string[] {
  const ids = new Set<string>();
  const pending = [document.root];
  for (let node = pending.pop(); node; node = pending.pop()) {
    for (const id of [node.fileId, node.captionsFileId, node.sceneFileId])
      if (id) ids.add(id);
    for (const evidence of node.aiEvidence ?? []) ids.add(evidence.fileId);
    if (node.children) pending.push(...node.children);
  }
  return [...ids];
}

function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      // Block ids and directions are the editor's bookkeeping, not words.
      .filter(([key]) => key !== "direction" && key !== "$")
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, comparable(item)]),
  );
}

/**
 * Whether two documents say the same thing. Stored copies come back with
 * their keys reordered, and the editor works out each block's direction as it
 * opens one, so neither counts as a change.
 */
export function sameContent(a: ContentDocument, b: ContentDocument): boolean {
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

/**
 * What each student starts their answer from: the part of a brief set aside
 * as each student's copy. Null when the brief sets nothing aside.
 */
export function starterOf(brief: ContentDocument): ContentDocument | null {
  const kept = (brief.root.children ?? [])
    .filter((node) => node.type === "starter")
    .flatMap((node) => node.children ?? []);
  return kept.length > 0 ? { root: { ...brief.root, children: kept } } : null;
}

/** A brief as students read it, without the part each of them gets a copy of. */
export function withoutStarter(brief: ContentDocument): ContentDocument {
  return {
    root: {
      ...brief.root,
      children: (brief.root.children ?? []).filter(
        (node) => node.type !== "starter",
      ),
    },
  };
}

/** The places a document acknowledges using an AI tool. */
export function aiUsesOf(document: ContentDocument): ContentNode[] {
  const found: ContentNode[] = [];
  const pending = [document.root];
  for (let node = pending.shift(); node; node = pending.shift()) {
    if (node.type === "ai-use") found.push(node);
    if (node.children) pending.push(...node.children);
  }
  return found;
}

export type AiUseGap = "tool" | "date" | "use" | "evidence";

/**
 * What an acknowledgement still lacks: the boards ask for the tool, the date
 * and how it was used, and JCQ also for the prompts and output kept as
 * evidence.
 */
export function aiUseGaps(
  node: ContentNode,
  evidenceRequired: boolean,
): AiUseGap[] {
  const gaps: AiUseGap[] = [];
  if (!node.aiTool?.trim()) gaps.push("tool");
  if (!node.aiDate) gaps.push("date");
  if (!node.aiUse?.trim() && !node.aiPrompt?.trim()) gaps.push("use");
  if (evidenceRequired && !node.aiEvidence?.length) gaps.push("evidence");
  return gaps;
}
