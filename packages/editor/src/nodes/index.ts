import type { ElementNode, LexicalNode } from "lexical";

import { $isTableCellNode } from "@lexical/table";
import { $isRootNode, createState } from "lexical";

import { AiUseNode } from "./ai-use";
import { $isCalloutNode, CalloutNode } from "./callout";
import { ChartNode } from "./chart";
import { $isColumnNode, ColumnNode, ColumnsNode } from "./columns";
import { DrawNode } from "./draw";
import { FootnoteNode } from "./footnote";
import { GateNode } from "./gate";
import { GlossaryNode } from "./glossary";
import { LtiNode } from "./lti";
import { MathNode } from "./math";
import { FileNode, ImageNode } from "./media";
import { MentionNode } from "./mention";
import { PageBreakNode } from "./page-break";
import {
  $isPanelBodyNode,
  PanelBodyNode,
  PanelNode,
  PanelsNode,
  PanelTitleNode,
} from "./panels";
import { CompareNode, GalleryNode } from "./pictures";
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
import { SharedNode } from "./shared";
import { StandardsNode } from "./standards";
import { $isStarterNode, StarterNode } from "./starter";
import { TermNode } from "./term";
import {
  $isToggleContentNode,
  ToggleContentNode,
  ToggleNode,
  ToggleTitleNode,
} from "./toggle";

export * from "./ai-use";
export * from "./callout";
export * from "./chart";
export * from "./code-run";
export * from "./columns";
export * from "./draw";
export * from "./footnote";
export * from "./gate";
export * from "./glossary";
export * from "./lti";
export * from "./math";
export * from "./media";
export * from "./mention";
export * from "./page-break";
export * from "./panels";
export * from "./pictures";
export * from "./question";
export * from "./rich";
export * from "./shared";
export * from "./standards";
export * from "./starter";
export * from "./term";
export * from "./toggle";

export const blockNodes = [
  CalloutNode,
  ToggleNode,
  ToggleTitleNode,
  ToggleContentNode,
  PanelsNode,
  PanelNode,
  PanelTitleNode,
  PanelBodyNode,
  ColumnsNode,
  ColumnNode,
  ImageNode,
  GalleryNode,
  CompareNode,
  ChartNode,
  FileNode,
  MediaNode,
  EmbedNode,
  LtiNode,
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
  DrawNode,
  StandardsNode,
  SharedNode,
  PageBreakNode,
  StarterNode,
  AiUseNode,
  MathNode,
  FootnoteNode,
  MentionNode,
  TermNode,
  GlossaryNode,
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
    $isPanelBodyNode(node) ||
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
