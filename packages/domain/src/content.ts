import * as v from "valibot";

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
] as const;
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
    }),
    v.check(validNode),
  ),
);
const inline = (child: ContentNode) =>
  ["text", "code-highlight", "tab", "linebreak", "link", "autolink"].includes(
    child.type,
  );
function validNode(node: ContentNode): boolean {
  const children = node.children ?? [];
  if (["text", "code-highlight", "tab"].includes(node.type))
    return (
      typeof node.text === "string" &&
      !node.children &&
      typeof node.format === "number"
    );
  if (["linebreak", "horizontalrule"].includes(node.type))
    return !node.children && node.text === undefined;
  if (
    !node.children ||
    node.text !== undefined ||
    typeof node.format === "number"
  )
    return false;

  switch (node.type) {
    case "root":
      return children.every((child) =>
        [
          "paragraph",
          "heading",
          "quote",
          "list",
          "code",
          "table",
          "horizontalrule",
        ].includes(child.type),
      );
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
const visit = (node: ContentNode): string =>
  node.text ??
  (node.type === "linebreak"
    ? "\n"
    : (node.children ?? [])
        .map(visit)
        .join(
          ["root", "list", "table", "tablerow"].includes(node.type) ? "\n" : "",
        ));
export function contentPlainText(document: ContentDocument): string {
  return visit(document.root);
}
