import type { ElementNode, LexicalNode } from "lexical";

import { $isTableCellNode } from "@lexical/table";
import { $isRootNode, createState } from "lexical";

import { $isCalloutNode, CalloutNode } from "./callout";
import { $isColumnNode, ColumnNode, ColumnsNode } from "./columns";
import { GateNode } from "./gate";
import { FileNode, ImageNode } from "./media";
import {
  QuestionAnswerNode,
  QuestionGapNode,
  QuestionGroupNode,
  QuestionNode,
  QuestionOptionNode,
  QuestionPairNode,
  QuestionPassageNode,
  QuestionPromptNode,
  QuestionSideNode,
} from "./question";
import { DiagramNode, EmbedNode, MediaNode } from "./rich";
import { $isStarterNode, StarterNode } from "./starter";
import {
  $isToggleContentNode,
  ToggleContentNode,
  ToggleNode,
  ToggleTitleNode,
} from "./toggle";

export * from "./callout";
export * from "./columns";
export * from "./gate";
export * from "./media";
export * from "./question";
export * from "./rich";
export * from "./starter";
export * from "./toggle";

export const blockNodes = [
  CalloutNode,
  ToggleNode,
  ToggleTitleNode,
  ToggleContentNode,
  ColumnsNode,
  ColumnNode,
  ImageNode,
  FileNode,
  MediaNode,
  EmbedNode,
  DiagramNode,
  QuestionNode,
  QuestionPromptNode,
  QuestionOptionNode,
  QuestionAnswerNode,
  QuestionPairNode,
  QuestionGroupNode,
  QuestionSideNode,
  QuestionPassageNode,
  QuestionGapNode,
  GateNode,
  StarterNode,
];

export const blockIdState = createState("id", {
  parse: (value) =>
    typeof value === "string" && /^[\da-z]{8,36}$/.test(value) ? value : "",
});

export function $isBlockContainer(
  node: LexicalNode | null | undefined,
  includeCells = true,
): node is ElementNode {
  return (
    $isRootNode(node) ||
    $isCalloutNode(node) ||
    $isStarterNode(node) ||
    $isToggleContentNode(node) ||
    $isColumnNode(node) ||
    (includeCells && $isTableCellNode(node))
  );
}

export function $nearestBlock(
  node: LexicalNode,
  includeCells = true,
): LexicalNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    const parent: ElementNode | null = current.getParent();
    if ($isBlockContainer(parent, includeCells)) return current;
    current = parent;
  }
  return null;
}
