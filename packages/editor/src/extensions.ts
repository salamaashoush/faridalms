import type {
  EditorState,
  ElementNode,
  LexicalNode,
  RangeSelection,
  TextNode as TextNodeType,
} from "lexical";

import { validContentStyle } from "@faridalms/domain/content";
import { isSafeContentUrl } from "@faridalms/domain/rich-text";
import {
  $isLinkNode,
  AutoLinkExtension,
  AutoLinkNode,
  LinkExtension,
  LinkNode,
} from "@lexical/link";
import { $patchStyleText } from "@lexical/selection";
import { $onEscapeDown, $onEscapeUp, mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $getState,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  $setState,
  COMMAND_PRIORITY_LOW,
  defineExtension,
  INSERT_PARAGRAPH_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_TAB_COMMAND,
  ParagraphNode,
  RootNode,
  TextNode,
} from "lexical";

import type { BlockType } from "./blocks";

import {
  $anchorFor,
  $currentBlock,
  $duplicateBlock,
  $moveBlock,
  $turnInto,
} from "./blocks";
import { createBlockId } from "./format";
import { backgroundColors } from "./formatting";
import {
  $isBlockContainer,
  $isCalloutNode,
  $isColumnNode,
  $isColumnsNode,
  $isToggleContentNode,
  $isToggleNode,
  $isToggleTitleNode,
  $isStarterNode,
  StarterNode,
  $createQuestionGroup,
  $createQuestionPair,
  $isQuestionAnswerNode,
  $isQuestionGroupNode,
  $isQuestionNode,
  $isQuestionOptionNode,
  $isQuestionPairNode,
  $isQuestionPromptNode,
  $isQuestionSideNode,
  $isQuestionGapNode,
  $isQuestionPassageNode,
  $insertMath,
  $markableAtCaret,
  $repairGap,
  $repairHolder,
  $indentCodeLine,
  $newCodeLine,
  $repairQuestion,
  $toggleMark,
  $typeGap,
  $unwrapStrayPart,
  QuestionAnswerNode,
  QuestionGapNode,
  QuestionGroupNode,
  QuestionNode,
  QuestionOptionNode,
  QuestionPairNode,
  QuestionPassageNode,
  QuestionPromptNode,
  QuestionSideNode,
  blockIdState,
  blockNodes,
  CalloutNode,
  ColumnNode,
  ColumnsNode,
  ToggleContentNode,
  ToggleNode,
  ToggleTitleNode,
} from "./nodes";

const escapable = (node: LexicalNode | null | undefined): node is ElementNode =>
  $isCalloutNode(node) ||
  $isStarterNode(node) ||
  $isToggleNode(node) ||
  $isColumnsNode(node) ||
  $isQuestionNode(node);

function $unwrapInto(node: ElementNode) {
  for (const child of node.getChildren()) node.insertBefore(child);
  node.remove();
}

function $fillEmpty(node: ElementNode) {
  if (node.isEmpty()) node.append($createParagraphNode());
}

function $assignBlockIds(container: ElementNode, seen: Set<string>) {
  for (const child of container.getChildren()) {
    if ($isElementNode(child) || !child.isInline()) {
      const id = $getState(child, blockIdState);
      if (!id || seen.has(id)) $setState(child, blockIdState, createBlockId());
      seen.add($getState(child, blockIdState));
    }
    if ($isElementNode(child))
      for (const nested of child.getChildren())
        if ($isBlockContainer(nested, false)) $assignBlockIds(nested, seen);
    if ($isBlockContainer(child, false)) $assignBlockIds(child, seen);
  }
}

const questionIdOf = (node: LexicalNode) =>
  $isQuestionNode(node) ? node.getSettings().questionId : null;
const hasOptionId = (node: LexicalNode) =>
  $isQuestionOptionNode(node) ||
  $isQuestionAnswerNode(node) ||
  $isQuestionPairNode(node) ||
  $isQuestionGroupNode(node) ||
  $isQuestionGapNode(node);
const optionIdOf = (node: LexicalNode) =>
  hasOptionId(node) ? node.getOptionId() : null;

/**
 * Answers point at question and option ids, so a copy pasted beside its
 * original gets new ones while the original, the node that was already in
 * the document, keeps its own. Remote merges skip transforms, so the server
 * refuses duplicates as well.
 */
function $uniqueAnswerIds(root: ElementNode, previous: EditorState) {
  const existed = (
    key: string,
    id: string,
    read: (node: LexicalNode) => string | null,
  ) =>
    previous.read(() => {
      const node = $getNodeByKey(key);
      return node ? read(node) === id : false;
    });
  const byId = new Map<string, LexicalNode[]>();
  for (const child of root.getChildren()) {
    if (!$isQuestionNode(child)) continue;
    const add = (id: string, node: LexicalNode) =>
      byId.set(id, [...(byId.get(id) ?? []), node]);
    add(child.getSettings().questionId, child);
    for (const part of child.getChildren()) {
      const id = optionIdOf(part);
      if (id) add(id, part);
      if ($isQuestionGroupNode(part) || $isQuestionPassageNode(part))
        for (const item of part.getChildren()) {
          const nested = optionIdOf(item);
          if (nested) add(nested, item);
        }
    }
  }
  for (const [id, nodes] of byId) {
    if (nodes.length < 2) continue;
    const keeper =
      nodes.find((node) =>
        existed(
          node.getKey(),
          id,
          $isQuestionNode(node) ? questionIdOf : optionIdOf,
        ),
      ) ?? nodes[0];
    for (const node of nodes) {
      if (node === keeper) continue;
      if ($isQuestionNode(node))
        node.setSettings({ questionId: crypto.randomUUID() });
      else if (hasOptionId(node)) node.setOptionId(crypto.randomUUID());
    }
  }
}

/**
 * Enter in a pair's first side goes to its match; in its match, to a new
 * pair, or out of the question from an empty last one. In a group's name it
 * goes to the first item; from an empty last item, to a new group.
 */
function $enterInHolder(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  let node: LexicalNode | null = selection.anchor.getNode();
  while (node && !$isQuestionSideNode(node) && !$isQuestionOptionNode(node))
    node = node.getParent();
  if (!node || !$isElementNode(node)) return false;
  const holder = node.getParent();
  const question = holder?.getParent();
  if (!$isQuestionNode(question)) return false;
  const leave = () => {
    const paragraph = $createParagraphNode();
    question.insertAfter(paragraph);
    paragraph.selectStart();
    return true;
  };
  if ($isQuestionPairNode(holder)) {
    const [first, second] = holder.getChildren();
    if (node.is(first) && $isElementNode(second)) {
      second.selectStart();
      return true;
    }
    if (
      holder.getTextContentSize() === 0 &&
      holder.is(question.getLastChild())
    ) {
      if (question.getChildren().filter($isQuestionPairNode).length > 2)
        holder.remove();
      return leave();
    }
    const pair = $createQuestionPair();
    holder.insertAfter(pair);
    pair.getFirstChild()?.selectStart();
    return true;
  }
  if ($isQuestionGroupNode(holder)) {
    if ($isQuestionSideNode(node)) {
      if (
        holder.getTextContentSize() === 0 &&
        holder.is(question.getLastChild())
      ) {
        if (question.getChildren().filter($isQuestionGroupNode).length > 2)
          holder.remove();
        return leave();
      }
      const first = node.getNextSibling();
      if ($isElementNode(first)) first.selectStart();
      else
        holder.append(new QuestionOptionNode()).getLastChild()?.selectStart();
      return true;
    }
    if (node.isEmpty() && node.is(holder.getLastChild())) {
      if (holder.getChildrenSize() > 2) node.remove();
      const group = $createQuestionGroup();
      holder.insertAfter(group);
      group.getFirstChild()?.selectStart();
      return true;
    }
  }
  return false;
}

function $caretAtEnd(part: ElementNode, selection: RangeSelection): boolean {
  const { anchor } = selection;
  if (anchor.type === "element")
    return (
      anchor.key === part.getKey() && anchor.offset === part.getChildrenSize()
    );
  const text = anchor.getNode();
  return (
    Boolean(part.getLastDescendant()?.is(text)) &&
    anchor.offset === text.getTextContentSize()
  );
}

/** Enter in a prompt goes to the first part; in an empty last part, out of the question. */
function $enterInQuestion(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  let node: LexicalNode | null = selection.anchor.getNode();
  while (
    node &&
    !$isQuestionPromptNode(node) &&
    !$isQuestionOptionNode(node) &&
    !$isQuestionAnswerNode(node) &&
    !$isQuestionPassageNode(node)
  )
    node = node.getParent();
  if (!node || !$isElementNode(node)) return false;
  const question = node.getParent();
  if (!$isQuestionNode(question)) return false;
  if ($isQuestionPromptNode(node)) {
    const first = node.getNextSibling();
    if ($isElementNode(first)) {
      first.selectStart();
      return true;
    }
    const paragraph = $createParagraphNode();
    question.insertAfter(paragraph);
    paragraph.selectStart();
    return true;
  }
  if (node.isEmpty() && node.is(question.getLastChild())) {
    const paragraph = $createParagraphNode();
    question.insertAfter(paragraph);
    if (question.getChildrenSize() > 2) node.remove();
    paragraph.selectStart();
    return true;
  }
  // An empty part waiting below is filled before another is added.
  const next = node.getNextSibling();
  if (
    $isElementNode(next) &&
    next.getType() === node.getType() &&
    next.isEmpty() &&
    $caretAtEnd(node, selection)
  ) {
    next.selectStart();
    return true;
  }
  return false;
}

const hex = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");

function normaliseColor(value: string): string | null {
  const rgb = value.match(
    /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/,
  );
  if (!rgb) return value;
  const [, r = "0", g = "0", b = "0", alpha] = rgb;
  const opacity = alpha
    ? alpha.endsWith("%")
      ? Number.parseFloat(alpha) / 100
      : Number.parseFloat(alpha)
    : 1;
  if (opacity === 0) return null;
  return `#${hex(Number(r))}${hex(Number(g))}${hex(Number(b))}${
    opacity < 1 ? hex(opacity * 255) : ""
  }`;
}

function sanitiseValue(property: string, value: string): string | null {
  if (property === "color" || property === "background-color")
    return normaliseColor(value);
  if (property === "font-size") {
    const size = Number.parseFloat(value);
    return value.endsWith("px") && size >= 8 && size <= 96
      ? `${Math.round(size)}px`
      : null;
  }
  if (property === "font-family")
    return value.replaceAll(/["']/g, "").split(",")[0]?.trim() ?? null;
  return null;
}

export function sanitiseStyle(style: string): string {
  if (!style || validContentStyle(style)) return style;
  const kept: string[] = [];
  for (const entry of style.split(";")) {
    const index = entry.indexOf(":");
    if (index < 0) continue;
    const property = entry.slice(0, index).trim().toLowerCase();
    const raw = entry.slice(index + 1).trim();
    const value = sanitiseValue(property, raw);
    const candidate = value ? `${property}: ${value}` : "";
    if (candidate && validContentStyle(candidate)) kept.push(candidate);
  }
  return kept.join(";");
}

function $sanitiseText(node: TextNodeType) {
  const style = node.getStyle();
  const next = sanitiseStyle(style);
  if (next !== style) node.setStyle(next);
}

function $sanitiseElement(node: ElementNode) {
  const style = node.getStyle();
  const next = sanitiseStyle(style);
  if (next !== style) node.setStyle(next);
  const textStyle = node.getTextStyle();
  const nextText = sanitiseStyle(textStyle);
  if (nextText !== textStyle) node.setTextStyle(nextText);
}

function $sanitiseLink(node: LinkNode) {
  if (!isSafeContentUrl(node.getURL())) $unwrapInto(node);
}

function $exitEmptyTrailingParagraph(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const paragraph = selection.anchor.getNode();
  if (!$isParagraphNode(paragraph) || !paragraph.isEmpty()) return false;
  const container = paragraph.getParent();
  if (
    !$isCalloutNode(container) &&
    !$isStarterNode(container) &&
    !$isToggleContentNode(container)
  )
    return false;
  if (
    !paragraph.is(container.getLastChild()) ||
    container.getChildrenSize() < 2
  )
    return false;
  const outer = $isToggleContentNode(container)
    ? container.getParent()
    : container;
  if (!outer) return false;
  outer.insertAfter(paragraph);
  paragraph.selectStart();
  return true;
}

function $enterFromToggleTitle(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  let node: LexicalNode | null = selection.anchor.getNode();
  while (node && !$isToggleTitleNode(node)) node = node.getParent();
  if (!node) return false;
  const toggle = node.getParent();
  if (!$isToggleNode(toggle)) return false;
  if (!toggle.getOpen()) toggle.setOpen(true);
  const content = node.getNextSibling();
  if ($isElementNode(content)) {
    const first = content.getFirstChild();
    if ($isElementNode(first)) first.selectStart();
    else content.append($createParagraphNode()).selectStart();
  }
  return true;
}

export const BlocksExtension = defineExtension({
  name: "faridalms/blocks",
  dependencies: [LinkExtension, AutoLinkExtension],
  nodes: blockNodes,
  register: (editor) =>
    mergeRegister(
      editor.registerNodeTransform(RootNode, (root) => {
        $assignBlockIds(root, new Set());
        $uniqueAnswerIds(root, editor.getEditorState());
      }),
      editor.registerNodeTransform(QuestionNode, (node) => {
        if (!$isRootNode(node.getParent())) $unwrapInto(node);
        else $repairQuestion(node);
      }),
      editor.registerNodeTransform(QuestionPromptNode, $unwrapStrayPart),
      editor.registerNodeTransform(QuestionOptionNode, $unwrapStrayPart),
      editor.registerNodeTransform(QuestionAnswerNode, $unwrapStrayPart),
      editor.registerNodeTransform(QuestionSideNode, $unwrapStrayPart),
      editor.registerNodeTransform(QuestionPassageNode, $unwrapStrayPart),
      editor.registerNodeTransform(QuestionGapNode, $repairGap),
      editor.registerNodeTransform(QuestionPairNode, $repairHolder),
      editor.registerNodeTransform(QuestionGroupNode, $repairHolder),
      editor.registerNodeTransform(TextNode, (node) => {
        $sanitiseText(node);
        $typeGap(node);
      }),
      editor.registerNodeTransform(ParagraphNode, $sanitiseElement),
      editor.registerNodeTransform(LinkNode, $sanitiseLink),
      editor.registerNodeTransform(AutoLinkNode, (node) => {
        if ($isLinkNode(node)) $sanitiseLink(node);
      }),
      editor.registerNodeTransform(CalloutNode, $fillEmpty),
      editor.registerNodeTransform(StarterNode, (node) => {
        if (!$isRootNode(node.getParent())) $unwrapInto(node);
        else $fillEmpty(node);
      }),
      editor.registerNodeTransform(ToggleContentNode, (node) => {
        if (!$isToggleNode(node.getParent())) $unwrapInto(node);
        else $fillEmpty(node);
      }),
      editor.registerNodeTransform(ToggleTitleNode, (node) => {
        if (!$isToggleNode(node.getParent()))
          node.replace($createParagraphNode().append(...node.getChildren()));
      }),
      editor.registerNodeTransform(ToggleNode, (node) => {
        const [title, content, ...rest] = node.getChildren();
        if (
          rest.length ||
          !$isToggleTitleNode(title) ||
          !$isToggleContentNode(content)
        )
          $unwrapInto(node);
      }),
      editor.registerNodeTransform(ColumnNode, (node) => {
        if (!$isColumnsNode(node.getParent())) $unwrapInto(node);
        else $fillEmpty(node);
      }),
      editor.registerNodeTransform(ColumnsNode, (node) => {
        const children = node.getChildren();
        if (children.length < 2 || !children.every($isColumnNode))
          $unwrapInto(node);
      }),
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () =>
          $enterInHolder() ||
          $newCodeLine() ||
          $enterInQuestion() ||
          $enterFromToggleTitle() ||
          $exitEmptyTrailingParagraph(),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => $indentCodeLine(event),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => $onEscapeDown(escapable, event),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        (event) => $onEscapeDown(escapable, event),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => $onEscapeUp(escapable, event),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        (event) => $onEscapeUp(escapable, event),
        COMMAND_PRIORITY_LOW,
      ),
    ),
});

const headingKeys: Record<string, BlockType> = {
  Digit0: "paragraph",
  Digit1: "h1",
  Digit2: "h2",
  Digit3: "h3",
};
const listKeys: Record<string, BlockType> = {
  Digit7: "number",
  Digit8: "bullet",
  Digit9: "check",
};

function $shortcut(event: KeyboardEvent): boolean {
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (event.altKey && event.shiftKey && !mod) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
    const block = $currentBlock(false);
    return block ? $moveBlock(block, event.key === "ArrowUp" ? -1 : 1) : false;
  }
  // Word's own key for a new formula, by the key or, where no key is told,
  // by the character.
  if (
    event.altKey &&
    !mod &&
    !event.shiftKey &&
    (event.code === "Equal" || event.key === "=")
  )
    return $insertMath() !== null;
  if (!mod) return false;
  const turn =
    event.altKey && !event.shiftKey ? headingKeys[event.code] : undefined;
  const list =
    event.shiftKey && !event.altKey ? listKeys[event.code] : undefined;
  const type = turn ?? list;
  if (type) {
    const block = $anchorFor(type);
    if (block) $turnInto(block, type);
    return Boolean(block);
  }
  if (event.altKey) return false;
  if (!event.shiftKey && key === "enter") {
    const option = $markableAtCaret();
    if (option) $toggleMark(option);
    return Boolean(option);
  }
  if (!event.shiftKey && key === "d") {
    const block = $currentBlock(false);
    if (block) $duplicateBlock(block);
    return Boolean(block);
  }
  if (!event.shiftKey && key === "e") {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.formatText("code");
    return true;
  }
  // As Google Docs and Word take them: by the key, since an Arabic layout
  // types another character there, or by the character where no key is told.
  const script =
    event.code === "Period" || key === "."
      ? "superscript"
      : event.code === "Comma" || key === ","
        ? "subscript"
        : null;
  if (!event.shiftKey && script) {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.formatText(script);
    return true;
  }
  if (event.shiftKey && key === "s") {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.formatText("strikethrough");
    return true;
  }
  if (event.shiftKey && key === "h") {
    const selection = $getSelection();
    if ($isRangeSelection(selection))
      $patchStyleText(selection, {
        "background-color": backgroundColors.yellow,
      });
    return true;
  }
  return false;
}

export const ShortcutsExtension = defineExtension({
  name: "faridalms/shortcuts",
  register: (editor) =>
    editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (!$shortcut(event)) return false;
        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
});
