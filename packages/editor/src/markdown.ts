import type {
  ElementTransformer,
  MultilineElementTransformer,
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
import { $isElementNode } from "lexical";

import {
  $isCalloutNode,
  $isColumnsNode,
  $isFileNode,
  $isImageNode,
  $isToggleNode,
  CalloutNode,
  ColumnsNode,
  FileNode,
  ImageNode,
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

const custom: ElementTransformer[] = [
  HORIZONTAL_RULE,
  CALLOUT,
  TOGGLE,
  COLUMNS,
  MEDIA,
];

export const markdownTransformers: Transformer[] = [
  CHECK_LIST,
  HORIZONTAL_RULE,
  CALLOUT,
  TOGGLE,
  COLUMNS,
  MEDIA,
  ...ELEMENT_TRANSFORMERS,
  ...MULTILINE_ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
];
