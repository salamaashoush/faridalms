import * as v from "valibot";

export const TEXT_LIMIT = 20000;
const nodeTypes = [
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "text",
  "hardBreak",
  "horizontalRule",
] as const;
const simpleMarks = ["bold", "italic", "underline", "strike", "code"] as const;
export type RichTextMark =
  | { type: (typeof simpleMarks)[number] }
  | { type: "link"; attrs: { href: string } };
export interface RichTextNode {
  type: (typeof nodeTypes)[number];
  text?: string;
  marks?: RichTextMark[];
  attrs?: { level?: number; start?: number };
  content?: RichTextNode[];
}
export interface RichTextDocument {
  type: "doc";
  content: RichTextNode[];
}

export function isSafeContentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !Array.from(value).some(
        (character) =>
          character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
      )
    );
  } catch {
    return false;
  }
}
const markSchema = v.variant("type", [
  ...simpleMarks.map((type) => v.object({ type: v.literal(type) })),
  v.object({
    type: v.literal("link"),
    attrs: v.object({
      href: v.pipe(v.string(), v.maxLength(2048), v.check(isSafeContentUrl)),
    }),
  }),
]);
const nodeSchema: v.GenericSchema<RichTextNode> = v.lazy(() =>
  v.pipe(
    v.object({
      type: v.picklist(nodeTypes),
      text: v.optional(v.pipe(v.string(), v.maxLength(TEXT_LIMIT))),
      marks: v.optional(v.pipe(v.array(markSchema), v.maxLength(6))),
      attrs: v.optional(
        v.object({
          level: v.optional(
            v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3)),
          ),
          start: v.optional(
            v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000000)),
          ),
        }),
      ),
      content: v.optional(v.pipe(v.array(nodeSchema), v.maxLength(2000))),
    }),
    v.check(validNode),
  ),
);
function validNode(node: RichTextNode): boolean {
  const children = node.content ?? [];
  if (node.type === "text")
    return Boolean(node.text?.length) && !node.content && !node.attrs;
  if (node.text !== undefined || node.marks !== undefined) return false;
  if (node.type === "hardBreak" || node.type === "horizontalRule")
    return !children.length && !node.attrs;
  if (node.type === "heading" && !node.attrs?.level) return false;
  if (node.attrs?.level !== undefined && node.type !== "heading") return false;
  if (node.attrs?.start !== undefined && node.type !== "orderedList")
    return false;
  if (node.type === "paragraph" || node.type === "heading")
    return children.every(
      (child) => child.type === "text" || child.type === "hardBreak",
    );
  if (node.type === "bulletList" || node.type === "orderedList")
    return (
      children.length > 0 &&
      children.every((child) => child.type === "listItem")
    );
  if (node.type === "listItem" && children[0]?.type !== "paragraph")
    return false;
  return children.length > 0 && children.every(isBlock);
}
function isBlock(node: RichTextNode): boolean {
  return (
    node.type !== "text" &&
    node.type !== "hardBreak" &&
    node.type !== "listItem"
  );
}
function boundedDocument(value: unknown): boolean {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const next = pending.pop();
    if (!next || next.depth > 16 || ++nodes > 5000) return false;
    if (
      typeof next.value === "object" &&
      next.value !== null &&
      "content" in next.value &&
      Array.isArray(next.value.content)
    ) {
      for (const child of next.value.content)
        pending.push({ value: child, depth: next.depth + 1 });
    }
  }
  return true;
}
export const richTextDocumentSchema = v.pipe(
  v.custom<RichTextDocument>(boundedDocument, "The document is too complex"),
  v.object({
    type: v.literal("doc"),
    content: v.pipe(v.array(nodeSchema), v.maxLength(2000)),
  }),
  v.check((document) => document.content.every(isBlock)),
  v.check(
    (document) => richTextPlainText(document).length <= TEXT_LIMIT,
    "The document is too long",
  ),
);
export function plainTextDocument(text: string): RichTextDocument {
  return {
    type: "doc",
    content: text.split(/\r?\n/).map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}
export function richTextPlainText(document: RichTextDocument): string {
  return document.content.map(nodeText).join("\n");
}
function nodeText(node: RichTextNode): string {
  return node.type === "text"
    ? (node.text ?? "")
    : node.type === "hardBreak"
      ? "\n"
      : (node.content ?? [])
          .map(nodeText)
          .join(
            node.type === "paragraph" || node.type === "heading" ? "" : "\n",
          );
}
export const richTextInputSchema = v.pipe(
  v.union([
    v.pipe(v.string(), v.maxLength(TEXT_LIMIT)),
    richTextDocumentSchema,
  ]),
  v.transform((value) =>
    typeof value === "string" ? plainTextDocument(value) : value,
  ),
);
export const requiredRichTextSchema = v.pipe(
  richTextInputSchema,
  v.check(
    (value) => richTextPlainText(value).trim().length > 0,
    "Write some content",
  ),
);
