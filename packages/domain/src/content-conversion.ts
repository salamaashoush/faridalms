import type { ContentDocument, ContentNode } from "./content";
import type { RichTextDocument, RichTextNode } from "./rich-text";

const formats = { bold: 1, italic: 2, strike: 4, underline: 8, code: 16 };
export function richTextToContent(document: RichTextDocument): ContentDocument {
  const convert = (node: RichTextNode): ContentNode => {
    const children = (node.content ?? []).map(convert);
    const base = {
      version: 1 as const,
      children,
      format: "" as const,
      indent: 0,
      direction: null,
    };
    if (node.type === "text") {
      const text: ContentNode = {
        type: "text",
        version: 1,
        text: node.text ?? "",
        format: (node.marks ?? []).reduce(
          (value, mark) =>
            mark.type === "link" ? value : value | formats[mark.type],
          0,
        ),
        mode: "normal",
        detail: 0,
        style: "",
      };
      const link = node.marks?.find((mark) => mark.type === "link");
      return link
        ? { ...base, type: "link", url: link.attrs.href, children: [text] }
        : text;
    }
    switch (node.type) {
      case "paragraph":
        return { ...base, type: "paragraph", textFormat: 0, textStyle: "" };
      case "heading":
        return {
          ...base,
          type: "heading",
          tag:
            node.attrs?.level === 1
              ? "h1"
              : node.attrs?.level === 2
                ? "h2"
                : "h3",
        };
      case "blockquote":
        return {
          ...base,
          type: "quote",
          children: children.flatMap((child, index) =>
            child.type === "paragraph"
              ? [
                  ...(child.children ?? []),
                  ...(index < children.length - 1
                    ? [{ type: "linebreak" as const, version: 1 as const }]
                    : []),
                ]
              : [child],
          ),
        };
      case "bulletList":
        return {
          ...base,
          type: "list",
          listType: "bullet",
          tag: "ul",
          start: 1,
        };
      case "orderedList":
        return {
          ...base,
          type: "list",
          listType: "number",
          tag: "ol",
          start: node.attrs?.start ?? 1,
        };
      case "listItem":
        return {
          ...base,
          type: "listitem",
          value: 1,
          children: children.flatMap((child, index) =>
            child.type === "paragraph"
              ? [
                  ...(child.children ?? []),
                  ...(index < children.length - 1
                    ? [{ type: "linebreak" as const, version: 1 as const }]
                    : []),
                ]
              : [child],
          ),
        };
      case "hardBreak":
        return { type: "linebreak", version: 1 };
      case "horizontalRule":
        return { type: "horizontalrule", version: 1 };
    }
    throw new Error("content.unsupported_node");
  };
  return {
    root: {
      type: "root",
      version: 1,
      children: document.content.map(convert),
      direction: null,
      format: "",
      indent: 0,
    },
  };
}
export function emptyContent(): ContentDocument {
  return {
    root: {
      type: "root",
      version: 1,
      children: [
        {
          type: "paragraph",
          version: 1,
          children: [],
          direction: null,
          format: "",
          indent: 0,
          textFormat: 0,
          textStyle: "",
        },
      ],
      direction: null,
      format: "",
      indent: 0,
    },
  };
}

/** A single-paragraph document from plain text, one line per paragraph. */
export function plainContent(text: string): ContentDocument {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  return {
    root: {
      type: "root",
      version: 1,
      children: lines.map((line) => ({
        type: "paragraph",
        version: 1,
        children: line
          ? [
              {
                type: "text",
                version: 1,
                format: 0,
                detail: 0,
                mode: "normal",
                style: "",
                text: line,
              },
            ]
          : [],
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
      })),
      direction: null,
      format: "",
      indent: 0,
    },
  };
}

/**
 * A document of headed parts: each heading a level-two heading followed by
 * its text, as newsletters were written before they became one document.
 */
export function headedContent(
  parts: { heading: string; body: ContentDocument }[],
): ContentDocument {
  const children = parts.flatMap(({ heading, body }) => [
    ...(heading.trim()
      ? [
          {
            type: "heading" as const,
            version: 1 as const,
            tag: "h2" as const,
            children: [
              {
                type: "text" as const,
                version: 1 as const,
                format: 0,
                detail: 0,
                mode: "normal" as const,
                style: "",
                text: heading.trim(),
              },
            ],
            direction: null,
            format: "" as const,
            indent: 0,
          },
        ]
      : []),
    ...(body.root.children ?? []),
  ]);
  return {
    root: {
      ...emptyContent().root,
      children: children.length ? children : emptyContent().root.children,
    },
  };
}
