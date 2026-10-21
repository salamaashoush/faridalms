import type {
  ElementTransformer,
  MultilineElementTransformer,
  TextMatchTransformer,
  Transformer,
} from "@lexical/markdown";
import type { ElementNode, LexicalNode } from "lexical";

import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/extension";
import {
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
} from "@lexical/markdown";
import { $isElementNode, $isParagraphNode } from "lexical";

import {
  $createMathNode,
  $isCalloutNode,
  $isMathNode,
  $isStarterNode,
  $isColumnsNode,
  $isFileNode,
  $isImageNode,
  $isToggleNode,
  CalloutNode,
  StarterNode,
  ColumnsNode,
  FileNode,
  ImageNode,
  MathNode,
  ToggleNode,
} from "./nodes";

const never = /(?!)/;

const blockTransformers: (ElementTransformer | MultilineElementTransformer)[] =
  [CHECK_LIST, ...ELEMENT_TRANSFORMERS, ...MULTILINE_ELEMENT_TRANSFORMERS];

function exportBlocks(
  nodes: LexicalNode[],
  traverse: (node: ElementNode) => string,
): string {
  return nodes
    .map((node) => {
      for (const transformer of [...blockTransformers, ...custom]) {
        const result = transformer.export?.(node, traverse);
        if (typeof result === "string") return result;
      }
      return $isElementNode(node) ? traverse(node) : node.getTextContent();
    })
    .join("\n\n");
}

const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(?:---|\*\*\*|___)\s?$/,
  replace: (parent, _children, _match, isImport) => {
    const rule = $createHorizontalRuleNode();
    if (isImport || parent.getNextSibling()) parent.replace(rule);
    else parent.insertBefore(rule);
    rule.selectNext();
  },
  type: "element",
};

const CALLOUT: ElementTransformer = {
  dependencies: [CalloutNode],
  export: (node, traverse) =>
    $isCalloutNode(node)
      ? exportBlocks(node.getChildren(), traverse)
          .split("\n")
          .map((line) => (line ? `> ${line}` : ">"))
          .join("\n")
      : null,
  regExp: never,
  replace: () => false,
  type: "element",
};

const TOGGLE: ElementTransformer = {
  dependencies: [ToggleNode],
  export: (node, traverse) => {
    if (!$isToggleNode(node)) return null;
    const [title, content] = node.getChildren();
    const heading = $isElementNode(title) ? traverse(title) : "";
    const body = $isElementNode(content)
      ? exportBlocks(content.getChildren(), traverse)
      : "";
    return [heading, body].filter(Boolean).join("\n\n");
  },
  regExp: never,
  replace: () => false,
  type: "element",
};

const COLUMNS: ElementTransformer = {
  dependencies: [ColumnsNode],
  export: (node, traverse) =>
    $isColumnsNode(node)
      ? node
          .getChildren()
          .map((column) =>
            $isElementNode(column)
              ? exportBlocks(column.getChildren(), traverse)
              : "",
          )
          .filter(Boolean)
          .join("\n\n")
      : null,
  regExp: never,
  replace: () => false,
  type: "element",
};

const MEDIA: ElementTransformer = {
  dependencies: [ImageNode, FileNode],
  export: (node) =>
    $isImageNode(node) || $isFileNode(node) ? node.getTextContent() : null,
  regExp: never,
  replace: () => false,
  type: "element",
};

const STARTER: ElementTransformer = {
  dependencies: [StarterNode],
  export: (node, traverse) =>
    $isStarterNode(node) ? exportBlocks(node.getChildren(), traverse) : null,
  regExp: never,
  replace: () => false,
  type: "element",
};

/**
 * Mathematics between dollar signs, as Markdown and LaTeX write it: $…$ in a
 * line and $$…$$ on its own. As in Pandoc, no space may sit inside either
 * sign, so "$5 and $10" stays two prices.
 */
const MATH: TextMatchTransformer = {
  dependencies: [MathNode],
  export: (node) =>
    $isMathNode(node)
      ? node.isBlock()
        ? `$$${node.getLatex()}$$`
        : `$${node.getLatex()}$`
      : null,
  importRegExp: /\$\$([^$]+)\$\$|\$([^$\s](?:[^$]*[^$\s])?)\$(?!\d)/,
  regExp: /\$\$([^$]+)\$\$$|(?<!\$)\$([^$\s](?:[^$]*[^$\s])?)\$$/,
  replace: (textNode, match) => {
    const block = match[1] !== undefined;
    textNode.replace(
      $createMathNode((match[1] ?? match[2] ?? "").trim(), block),
    );
  },
  trigger: "$",
  type: "text-match",
};

const custom: ElementTransformer[] = [
  HORIZONTAL_RULE,
  CALLOUT,
  STARTER,
  TOGGLE,
  COLUMNS,
  MEDIA,
];

export const markdownTransformers: Transformer[] = [
  CHECK_LIST,
  HORIZONTAL_RULE,
  CALLOUT,
  STARTER,
  TOGGLE,
  COLUMNS,
  MEDIA,
  ...ELEMENT_TRANSFORMERS,
  ...MULTILINE_ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS,
  MATH,
  ...TEXT_MATCH_TRANSFORMERS,
];

/**
 * Typing a block shortcut turns a paragraph into a heading, list, quote or
 * code; a question's parts stay what they are, so a line of Python that
 * starts with "# " stays a comment.
 */
export const markdownShortcuts: Transformer[] = markdownTransformers.map(
  (transformer): Transformer => {
    if (transformer.type === "element") {
      const element: ElementTransformer = {
        ...transformer,
        replace: (parent, children, match, isImport) =>
          $isParagraphNode(parent)
            ? transformer.replace(parent, children, match, isImport)
            : false,
      };
      return element;
    }
    if (transformer.type === "multiline-element") {
      const multiline: MultilineElementTransformer = {
        ...transformer,
        replace: (parent, children, start, end, lines, isImport) =>
          $isParagraphNode(parent)
            ? transformer.replace(parent, children, start, end, lines, isImport)
            : false,
      };
      return multiline;
    }
    return transformer;
  },
);
