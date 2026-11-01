import type { ContentDocument, ContentNode } from "./content";

export const TEXT_FORMAT = { bold: 1, italic: 2 } as const;

export function textNode(text: string, format = 0): ContentNode {
  return {
    type: "text",
    version: 1,
    format,
    detail: 0,
    mode: "normal",
    style: "",
    text,
  };
}

export function paragraphNode(children: ContentNode[]): ContentNode {
  return {
    type: "paragraph",
    version: 1,
    children,
    direction: null,
    format: "",
    indent: 0,
    textFormat: 0,
    textStyle: "",
  };
}

export function headingNode(
  tag: "h1" | "h2" | "h3",
  children: ContentNode[],
): ContentNode {
  return {
    type: "heading",
    version: 1,
    tag,
    children,
    direction: null,
    format: "",
    indent: 0,
  };
}

/** A list whose items are each a line of inline nodes, numbered as the editor counts them. */
export function listNode(
  listType: "bullet" | "number",
  items: ContentNode[][],
): ContentNode {
  return {
    type: "list",
    version: 1,
    listType,
    tag: listType === "bullet" ? "ul" : "ol",
    start: 1,
    children: items.map((children, index) => ({
      type: "listitem",
      version: 1,
      value: index + 1,
      children,
      direction: null,
      format: "",
      indent: 0,
    })),
    direction: null,
    format: "",
    indent: 0,
  };
}

/** A document of the given blocks. */
export function contentOf(children: ContentNode[]): ContentDocument {
  return {
    root: {
      type: "root",
      version: 1,
      children,
      direction: null,
      format: "",
      indent: 0,
    },
  };
}

export function emptyContent(): ContentDocument {
  return contentOf([paragraphNode([])]);
}

/** A single-paragraph document from plain text, one line per paragraph. */
export function plainContent(text: string): ContentDocument {
  return contentOf(
    text
      .replaceAll("\r\n", "\n")
      .split("\n")
      .map((line) => paragraphNode(line ? [textNode(line)] : [])),
  );
}

/**
 * A document with a file block for each file after its words, as the
 * attachments of an email that arrived take their place in the message.
 */
export function withFileBlocks(
  document: ContentDocument,
  files: readonly {
    id: string;
    name: string;
    mediaType: string;
    sizeBytes: number;
  }[],
): ContentDocument {
  if (files.length === 0) return document;
  return {
    root: {
      ...document.root,
      children: [
        ...(document.root.children ?? []),
        ...files.map((file): ContentNode => ({
          type: "file",
          version: 1,
          format: "",
          fileId: file.id,
          name: file.name,
          mime: file.mediaType,
          bytes: file.sizeBytes,
        })),
      ],
    },
  };
}

/**
 * A document's words with `{name}`-style fields filled in, as a template
 * is put in the composer; a field with no value keeps its braces.
 */
export function fillFields(
  document: ContentDocument,
  values: Readonly<Record<string, string>>,
): ContentDocument {
  const fill = (node: ContentNode): ContentNode => ({
    ...node,
    ...(typeof node.text === "string"
      ? {
          text: node.text.replaceAll(
            /\{([a-z]+)\}/g,
            (whole, key: string) => values[key] ?? whole,
          ),
        }
      : {}),
    ...(node.children ? { children: node.children.map(fill) } : {}),
  });
  return { root: fill(document.root) };
}

/** A document of headed parts: each heading a level-two heading followed by its text. */
export function headedContent(
  parts: { heading: string; body: ContentDocument }[],
): ContentDocument {
  const children = parts.flatMap(({ heading, body }) => [
    ...(heading.trim() ? [headingNode("h2", [textNode(heading.trim())])] : []),
    ...(body.root.children ?? []),
  ]);
  return contentOf(children.length ? children : [paragraphNode([])]);
}
