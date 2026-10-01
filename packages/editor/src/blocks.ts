import type { QuestionKind } from "@faridalms/domain/content";
import type { ListType } from "@lexical/list";
import type {
  ElementNode,
  LexicalNode,
  SerializedElementNode,
  SerializedLexicalNode,
} from "lexical";
import type { LucideIcon } from "lucide-react";

import { $createCodeNode, $isCodeNode } from "@lexical/code";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
} from "@lexical/extension";
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
} from "@lexical/rich-text";
import {
  $createTableNodeWithDimensions,
  $isTableCellNode,
  $isTableNode,
} from "@lexical/table";
import {
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isNodeSelection,
  $isRootNode,
  $parseSerializedNode,
} from "lexical";
import {
  ChevronRight,
  CircleCheck,
  Clapperboard,
  Code,
  Columns2,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListChecks,
  ListOrdered,
  Megaphone,
  MessageSquareText,
  Minus,
  MonitorPlay,
  Paperclip,
  Pilcrow,
  Quote,
  Shapes,
  Table,
  TextCursorInput,
} from "lucide-react";

import type { EditorStrings } from "./strings";

import {
  $createCalloutNode,
  $createColumnNode,
  $createQuestionNode,
  $createColumnsNode,
  $createToggleContentNode,
  $createToggleNode,
  $createToggleTitleNode,
  $isCalloutNode,
  $isColumnsNode,
  $isQuestionNode,
  $isToggleNode,
  $nearestBlock,
} from "./nodes";

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "number"
  | "check"
  | "quote"
  | "code"
  | "callout"
  | "toggle"
  | "divider"
  | "table"
  | "columns2"
  | "columns3"
  | "image"
  | "file"
  | "media"
  | "embed"
  | "diagram"
  | "choiceQuestion"
  | "typedQuestion"
  | "writtenQuestion";

export type BlockGroup = "text" | "lists" | "media" | "layout" | "questions";

const QUESTION_KIND: Partial<Record<BlockType, QuestionKind>> = {
  choiceQuestion: "choice",
  typedQuestion: "text",
  writtenQuestion: "written",
};

export interface BlockDefinition {
  type: BlockType;
  group: BlockGroup;
  icon: LucideIcon;
  label: (strings: EditorStrings) => string;
  hint: (strings: EditorStrings) => string;
  keywords: string[];
  shortcut?: string;
  convertible?: boolean;
  media?: boolean;
  prompt?: boolean;
  /** Offered only where the document may ask questions, such as a lesson. */
  question?: boolean;
}

export const blockDefinitions: BlockDefinition[] = [
  {
    type: "paragraph",
    group: "text",
    icon: Pilcrow,
    label: (s) => s.text,
    hint: (s) => s.textHint,
    keywords: ["text", "paragraph", "plain", "نص", "فقرة"],
    convertible: true,
  },
  {
    type: "h1",
    group: "text",
    icon: Heading1,
    label: (s) => s.heading1,
    hint: (s) => s.heading1Hint,
    keywords: ["h1", "heading", "title", "عنوان"],
    shortcut: "#",
    convertible: true,
  },
  {
    type: "h2",
    group: "text",
    icon: Heading2,
    label: (s) => s.heading2,
    hint: (s) => s.heading2Hint,
    keywords: ["h2", "heading", "subtitle", "عنوان"],
    shortcut: "##",
    convertible: true,
  },
  {
    type: "h3",
    group: "text",
    icon: Heading3,
    label: (s) => s.heading3,
    hint: (s) => s.heading3Hint,
    keywords: ["h3", "heading", "عنوان"],
    shortcut: "###",
    convertible: true,
  },
  {
    type: "bullet",
    group: "lists",
    icon: List,
    label: (s) => s.bulletList,
    hint: (s) => s.bulletListHint,
    keywords: ["bullet", "list", "ul", "unordered", "قائمة", "نقطية"],
    shortcut: "-",
    convertible: true,
  },
  {
    type: "number",
    group: "lists",
    icon: ListOrdered,
    label: (s) => s.numberedList,
    hint: (s) => s.numberedListHint,
    keywords: ["number", "ordered", "ol", "list", "قائمة", "مرقمة"],
    shortcut: "1.",
    convertible: true,
  },
  {
    type: "check",
    group: "lists",
    icon: ListChecks,
    label: (s) => s.checklist,
    hint: (s) => s.checklistHint,
    keywords: ["todo", "task", "check", "checklist", "مهام", "مهمة"],
    shortcut: "[]",
    convertible: true,
  },
  {
    type: "toggle",
    group: "lists",
    icon: ChevronRight,
    label: (s) => s.toggle,
    hint: (s) => s.toggleHint,
    keywords: ["toggle", "collapse", "details", "accordion", "طي", "إخفاء"],
    convertible: true,
  },
  {
    type: "quote",
    group: "text",
    icon: Quote,
    label: (s) => s.quote,
    hint: (s) => s.quoteHint,
    keywords: ["quote", "blockquote", "citation", "اقتباس"],
    shortcut: ">",
    convertible: true,
  },
  {
    type: "callout",
    group: "text",
    icon: Megaphone,
    label: (s) => s.callout,
    hint: (s) => s.calloutHint,
    keywords: ["callout", "note", "info", "tip", "warning", "ملاحظة", "تنبيه"],
    convertible: true,
  },
  {
    type: "code",
    group: "text",
    icon: Code,
    label: (s) => s.code,
    hint: (s) => s.codeHint,
    keywords: ["code", "snippet", "program", "كود", "برمجة"],
    shortcut: "```",
    convertible: true,
  },
  {
    type: "image",
    group: "media",
    icon: Image,
    label: (s) => s.image,
    hint: (s) => s.imageHint,
    keywords: ["image", "picture", "photo", "img", "صورة"],
    media: true,
  },
  {
    type: "media",
    group: "media",
    icon: Clapperboard,
    label: (s) => s.media,
    hint: (s) => s.mediaHint,
    keywords: ["video", "audio", "sound", "recording", "mp4", "فيديو", "صوت"],
    media: true,
  },
  {
    type: "file",
    group: "media",
    icon: Paperclip,
    label: (s) => s.file,
    hint: (s) => s.fileHint,
    keywords: ["file", "attachment", "upload", "pdf", "ملف", "مرفق"],
    media: true,
  },
  {
    type: "embed",
    group: "media",
    icon: MonitorPlay,
    label: (s) => s.embed,
    hint: (s) => s.embedHint,
    keywords: [
      "embed",
      "youtube",
      "vimeo",
      "google",
      "slides",
      "docs",
      "canva",
      "loom",
      "تضمين",
      "يوتيوب",
    ],
    prompt: true,
  },
  {
    type: "diagram",
    group: "media",
    icon: Shapes,
    label: (s) => s.diagram,
    hint: (s) => s.diagramHint,
    keywords: [
      "drawing",
      "diagram",
      "sketch",
      "whiteboard",
      "mind map",
      "رسم",
      "مخطط",
    ],
    media: true,
  },
  {
    type: "table",
    group: "layout",
    icon: Table,
    label: (s) => s.table,
    hint: (s) => s.tableHint,
    keywords: ["table", "grid", "rows", "جدول"],
  },
  {
    type: "columns2",
    group: "layout",
    icon: Columns2,
    label: (s) => s.columns2,
    hint: (s) => s.columnsHint,
    keywords: ["columns", "layout", "side", "two", "أعمدة", "عمودان"],
  },
  {
    type: "columns3",
    group: "layout",
    icon: Columns3,
    label: (s) => s.columns3,
    hint: (s) => s.columnsHint,
    keywords: ["columns", "layout", "three", "أعمدة", "ثلاثة"],
  },
  {
    type: "divider",
    group: "layout",
    icon: Minus,
    label: (s) => s.divider,
    hint: (s) => s.dividerHint,
    keywords: ["divider", "line", "hr", "separator", "فاصل", "خط"],
    shortcut: "---",
  },
  {
    type: "choiceQuestion",
    group: "questions",
    icon: CircleCheck,
    label: (s) => s.questionChoice,
    hint: (s) => s.questionChoiceHint,
    keywords: ["question", "choice", "quiz", "mcq", "سؤال", "اختيار"],
    question: true,
  },
  {
    type: "typedQuestion",
    group: "questions",
    icon: TextCursorInput,
    label: (s) => s.questionTyped,
    hint: (s) => s.questionTypedHint,
    keywords: ["question", "typed", "answer", "short", "سؤال", "إجابة"],
    question: true,
  },
  {
    type: "writtenQuestion",
    group: "questions",
    icon: MessageSquareText,
    label: (s) => s.questionWritten,
    hint: (s) => s.questionWrittenHint,
    keywords: ["question", "written", "essay", "long", "سؤال", "مقال"],
    question: true,
  },
];

export function filterBlocks(
  query: string,
  strings: EditorStrings,
  media: boolean,
  questions = false,
): BlockDefinition[] {
  const needle = query.trim().toLocaleLowerCase();
  return blockDefinitions.filter(
    (block) =>
      (media || !block.media) &&
      (questions || !block.question) &&
      (!needle ||
        block.label(strings).toLocaleLowerCase().includes(needle) ||
        block.keywords.some((keyword) => keyword.startsWith(needle))),
  );
}

const listTypes: Partial<Record<BlockType, ListType>> = {
  bullet: "bullet",
  number: "number",
  check: "check",
};

function inlineChildren(block: LexicalNode): LexicalNode[] {
  if ($isListNode(block))
    return block
      .getChildren()
      .flatMap((item) =>
        $isElementNode(item)
          ? item.getChildren().filter((child) => !$isListNode(child))
          : [],
      );
  return $isParagraphNode(block) ||
    $isHeadingNode(block) ||
    $isQuoteNode(block) ||
    $isCodeNode(block)
    ? block.getChildren()
    : [];
}

export function $isConvertible(block: LexicalNode | null): boolean {
  return (
    $isParagraphNode(block) ||
    $isHeadingNode(block) ||
    $isQuoteNode(block) ||
    $isCodeNode(block) ||
    $isListNode(block) ||
    $isCalloutNode(block) ||
    $isToggleNode(block)
  );
}

export function $blockTypeOf(block: LexicalNode | null): BlockType | null {
  if (!block) return null;
  if ($isParagraphNode(block)) return "paragraph";
  if ($isHeadingNode(block)) {
    const tag = block.getTag();
    return tag === "h1" ? "h1" : tag === "h2" ? "h2" : "h3";
  }
  if ($isListNode(block)) {
    const type = block.getListType();
    return type === "bullet"
      ? "bullet"
      : type === "number"
        ? "number"
        : "check";
  }
  if ($isQuoteNode(block)) return "quote";
  if ($isCodeNode(block)) return "code";
  if ($isCalloutNode(block)) return "callout";
  if ($isToggleNode(block)) return "toggle";
  if ($isTableNode(block)) return "table";
  if ($isHorizontalRuleNode(block)) return "divider";
  if ($isColumnsNode(block)) return "columns2";
  return null;
}

function $textBlock(type: BlockType): ElementNode | null {
  if (type === "paragraph") return $createParagraphNode();
  if (type === "h1" || type === "h2" || type === "h3")
    return $createHeadingNode(type);
  if (type === "quote") return $createQuoteNode();
  if (type === "code") return $createCodeNode();
  return null;
}

function $unwrap(block: ElementNode): LexicalNode[] {
  if ($isToggleNode(block)) {
    const [title, content] = block.getChildren();
    const nodes: LexicalNode[] = [];
    if ($isElementNode(title))
      nodes.push($createParagraphNode().append(...title.getChildren()));
    if ($isElementNode(content)) nodes.push(...content.getChildren());
    return nodes;
  }
  return block.getChildren();
}

export function $turnInto(block: LexicalNode, type: BlockType): LexicalNode {
  if (!$isConvertible(block)) return block;
  if ($isCalloutNode(block) || $isToggleNode(block)) {
    if (type === "callout" && $isCalloutNode(block)) return block;
    if (type === "toggle" && $isToggleNode(block)) return block;
    const nodes = $unwrap(block);
    for (const node of nodes) block.insertBefore(node);
    block.remove();
    const first = nodes[0];
    return first ? $turnInto(first, type) : block;
  }
  const listType = listTypes[type];
  if (listType) {
    if ($isListNode(block)) {
      block.setListType(listType);
      return block;
    }
    const list = $createListNode(listType);
    const item = $createListItemNode(listType === "check" ? false : undefined);
    item.append(...inlineChildren(block));
    list.append(item);
    block.replace(list);
    return list;
  }
  if (type === "callout") {
    const callout = $createCalloutNode();
    block.replace(callout);
    callout.append(block);
    return callout;
  }
  if (type === "toggle") {
    const title = $createToggleTitleNode().append(...inlineChildren(block));
    const toggle = $createToggleNode(true).append(
      title,
      $createToggleContentNode().append($createParagraphNode()),
    );
    block.replace(toggle);
    return toggle;
  }
  if ($isListNode(block)) {
    const created: ElementNode[] = [];
    for (const item of block.getChildren()) {
      const node = $textBlock(type);
      if (!node || !$isListItemNode(item)) continue;
      node.append(...item.getChildren().filter((child) => !$isListNode(child)));
      block.insertBefore(node);
      created.push(node);
    }
    const [first] = created;
    if (!first) return block;
    block.remove();
    return first;
  }
  const next = $textBlock(type);
  if (!next || !$isElementNode(block)) return block;
  next.append(...inlineChildren(block));
  next.setFormat(block.getFormatType());
  next.setIndent(block.getIndent());
  block.replace(next);
  return next;
}

function $selectInside(node: LexicalNode) {
  if ($isQuestionNode(node)) {
    node.getFirstChild()?.selectStart();
    return;
  }
  if ($isToggleNode(node)) {
    node.getFirstChild()?.selectEnd();
    return;
  }
  if ($isCalloutNode(node) || $isColumnsNode(node)) {
    node.getFirstDescendant()?.selectStart();
    return;
  }
  if ($isListNode(node)) {
    node.getFirstChild()?.selectEnd();
    return;
  }
  if ($isTableNode(node)) {
    node.getFirstDescendant()?.selectStart();
    return;
  }
  if ($isElementNode(node)) node.selectEnd();
}

function $createStructure(type: BlockType): LexicalNode | null {
  const kind = QUESTION_KIND[type];
  if (kind) return $createQuestionNode(kind);
  if (type === "divider") return $createHorizontalRuleNode();
  if (type === "table")
    return $createTableNodeWithDimensions(3, 3, { rows: true, columns: false });
  if (type === "columns2" || type === "columns3") {
    const columns = $createColumnsNode(type === "columns2" ? "1:1" : "1:1:1");
    for (let index = 0; index < (type === "columns2" ? 2 : 3); index++)
      columns.append($createColumnNode().append($createParagraphNode()));
    return columns;
  }
  return null;
}

function $selectionNode(): LexicalNode | null {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) return selection.anchor.getNode();
  if ($isNodeSelection(selection)) return selection.getNodes()[0] ?? null;
  return null;
}

export function $currentBlock(includeCells = true): LexicalNode | null {
  const node = $selectionNode();
  return node ? $nearestBlock(node, includeCells) : null;
}

const cellTypes = new Set<BlockType>([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "quote",
  "code",
  "bullet",
  "number",
  "check",
]);

function $allows(container: LexicalNode | null, type: BlockType): boolean {
  if ($isTableCellNode(container)) return cellTypes.has(type);
  if (type === "columns2" || type === "columns3" || QUESTION_KIND[type])
    return $isRootNode(container);
  if ($isCalloutNode(container)) return type !== "callout";
  return true;
}

export function $anchorFor(
  type: BlockType,
  node: LexicalNode | null = $selectionNode(),
): LexicalNode | null {
  let block = node ? $nearestBlock(node) : null;
  while (block && !$allows(block.getParent(), type)) {
    const parent = block.getParent();
    block = parent ? $nearestBlock(parent) : null;
  }
  return block;
}

function $isEmptyParagraph(node: LexicalNode | null): node is ElementNode {
  return $isParagraphNode(node) && node.getTextContentSize() === 0;
}

export function $insertBlock(
  type: BlockType,
  anchor: LexicalNode | null = $anchorFor(type),
): LexicalNode | null {
  if (!anchor) return null;
  let target: LexicalNode = anchor;
  if (!$isEmptyParagraph(target)) {
    const paragraph = $createParagraphNode();
    target.insertAfter(paragraph);
    target = paragraph;
  }
  const structure = $createStructure(type);
  if (structure) {
    if (type === "divider") {
      target.insertBefore(structure);
      if ($isElementNode(target)) target.selectStart();
      return structure;
    }
    target.replace(structure);
    if (!structure.getNextSibling())
      structure.insertAfter($createParagraphNode());
    $selectInside(structure);
    return structure;
  }
  const next = $turnInto(target, type);
  $selectInside(next);
  return next;
}

function serialize(node: LexicalNode): SerializedLexicalNode {
  if (!$isElementNode(node)) return node.exportJSON();
  const element: SerializedElementNode = {
    ...node.exportJSON(),
    children: node.getChildren().map(serialize),
  };
  return element;
}

export function $duplicateBlock(block: LexicalNode): LexicalNode {
  const copy = $parseSerializedNode(serialize(block));
  block.insertAfter(copy);
  return copy;
}

export function $moveBlock(block: LexicalNode, direction: -1 | 1): boolean {
  const sibling =
    direction < 0 ? block.getPreviousSibling() : block.getNextSibling();
  if (!sibling) return false;
  if (direction < 0) sibling.insertBefore(block);
  else sibling.insertAfter(block);
  return true;
}
