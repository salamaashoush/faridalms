import type { Anchor, AnchorPoint } from "@faridalms/domain/anchors";
import type {
  BaseSelection,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  PointType,
  TextNode,
} from "lexical";

import { comparePoints, wholeBlock } from "@faridalms/domain/anchors";
import { quoteOf } from "@faridalms/domain/document-comments";
import { $dfs } from "@lexical/utils";
import {
  $getNodeByKey,
  $getRoot,
  $getState,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
} from "lexical";

import { blockIdState } from "./nodes";

/**
 * Comments point into the document the way readers' comments do: a block
 * id and how many characters of that block's own text come before the
 * place. Block ids travel with their blocks through every edit, live ones
 * included, so a passage is found again for as long as its block is there;
 * nothing about a comment is ever written into the document.
 */

/** The block a node stands in: itself, or its nearest ancestor with a block id. */
export function $blockOf(
  node: LexicalNode,
): { node: LexicalNode; id: string } | null {
  for (let at: LexicalNode | null = node; at; at = at.getParent()) {
    const id = $getState(at, blockIdState);
    if (id) return { node: at, id };
  }
  return null;
}

/** A block's own text, in reading order, leaving out the blocks inside it. */
function $textsOf(block: LexicalNode): TextNode[] {
  if (!$isElementNode(block)) return [];
  const found: TextNode[] = [];
  for (const { node } of $dfs(block))
    if ($isTextNode(node) && $blockOf(node)?.node.is(block)) found.push(node);
  return found;
}

/** The text a selection point falls in, moved onto the nearest text where it sits between nodes. */
function $textAt(point: PointType): [TextNode, number] | null {
  const node = point.getNode();
  if ($isTextNode(node)) return [node, point.offset];
  if (!$isElementNode(node)) return null;
  const after = node.getChildAtIndex(point.offset);
  const first = $isElementNode(after) ? after.getFirstDescendant() : after;
  if ($isTextNode(first)) return [first, 0];
  const before =
    point.offset > 0 ? node.getChildAtIndex(point.offset - 1) : null;
  const last = $isElementNode(before) ? before.getLastDescendant() : before;
  if ($isTextNode(last)) return [last, last.getTextContentSize()];
  return null;
}

function $pointOf(point: PointType): AnchorPoint | null {
  const text = $textAt(point);
  if (!text) {
    const block = $blockOf(point.getNode());
    return block ? { block: block.id, offset: 0 } : null;
  }
  const [node, offset] = text;
  const block = $blockOf(node);
  if (!block) return null;
  let before = 0;
  for (const other of $textsOf(block.node)) {
    if (other.is(node)) return { block: block.id, offset: before + offset };
    before += other.getTextContentSize();
  }
  return null;
}

/** A block as a whole, its words kept to say what the thread was about. */
export function $blockAnchor(
  key: NodeKey,
): { anchor: Anchor; quote: string } | null {
  const node = $getNodeByKey(key);
  const block = node ? $blockOf(node) : null;
  if (!block) return null;
  const point = { block: block.id, offset: 0 };
  return {
    anchor: { start: point, end: point },
    quote: quoteOf(block.node.getTextContent()),
  };
}

/**
 * Where a selection sits as an anchor, with the words it holds: selected
 * words as a passage, a selected block as the whole block.
 */
export function $selectionAnchor(
  selection: BaseSelection | null,
): { anchor: Anchor; quote: string } | null {
  if ($isNodeSelection(selection)) {
    const [node] = selection.getNodes();
    return node ? $blockAnchor(node.getKey()) : null;
  }
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return null;
  const [first, last] = selection.isBackward()
    ? [selection.focus, selection.anchor]
    : [selection.anchor, selection.focus];
  const start = $pointOf(first);
  const end = $pointOf(last);
  if (!start || !end) return null;
  const quote = quoteOf(selection.getTextContent());
  if (start.block === end.block && start.offset === end.offset) return null;
  return { anchor: { start, end }, quote };
}

/** Where the caret stands, for finding the thread a click lands in. */
export function $caretPoint(
  selection: BaseSelection | null,
): AnchorPoint | null {
  if ($isNodeSelection(selection)) {
    const [node] = selection.getNodes();
    const block = node ? $blockOf(node) : null;
    return block ? { block: block.id, offset: 0 } : null;
  }
  return $isRangeSelection(selection) ? $pointOf(selection.focus) : null;
}

/** The order the document's blocks stand in, by id. */
export function $blockOrder(): Map<string, number> {
  const order = new Map<string, number>();
  for (const { node } of $dfs($getRoot())) {
    const id = $getState(node, blockIdState);
    if (id && !order.has(id)) order.set(id, order.size);
  }
  return order;
}

interface TextPoint {
  key: NodeKey;
  offset: number;
}

/** A thread found in the document: words between two text points, or a block as a whole. */
export type Placement =
  | { kind: "text"; start: TextPoint; end: TextPoint }
  | { kind: "block"; key: NodeKey };

function $locate(
  block: LexicalNode,
  offset: number,
  side: "start" | "end",
): TextPoint | null {
  let before = 0;
  let last: TextNode | null = null;
  for (const text of $textsOf(block)) {
    const after = before + text.getTextContentSize();
    if (side === "start" ? offset < after : offset <= after)
      return { key: text.getKey(), offset: offset - before };
    before = after;
    last = text;
  }
  return last && offset === before
    ? { key: last.getKey(), offset: last.getTextContentSize() }
    : null;
}

/**
 * Where each anchor's passage is now, by id, in the order the passages
 * stand in the document. An anchor whose block is gone, or whose words no
 * longer reach as far as it says, is left out: its passage was deleted.
 */
export function $placeAnchors(
  anchors: readonly { id: string; anchor: Anchor }[],
): { id: string; placement: Placement }[] {
  if (anchors.length === 0) return [];
  const order = new Map<string, number>();
  const blocks = new Map<string, LexicalNode>();
  for (const { node } of $dfs($getRoot())) {
    const id = $getState(node, blockIdState);
    if (id && !blocks.has(id)) {
      order.set(id, order.size);
      blocks.set(id, node);
    }
  }
  const placed: { id: string; anchor: Anchor; placement: Placement }[] = [];
  for (const { id, anchor } of anchors) {
    const first = blocks.get(anchor.start.block);
    const last = blocks.get(anchor.end.block);
    if (!first || !last || comparePoints(anchor.start, anchor.end, order) > 0)
      continue;
    if (wholeBlock(anchor)) {
      placed.push({
        id,
        anchor,
        placement: { kind: "block", key: first.getKey() },
      });
      continue;
    }
    const start = $locate(first, anchor.start.offset, "start");
    const end = $locate(last, anchor.end.offset, "end");
    if (start && end)
      placed.push({ id, anchor, placement: { kind: "text", start, end } });
  }
  return placed
    .toSorted((a, b) => comparePoints(a.anchor.start, b.anchor.start, order))
    .map(({ id, placement }) => ({ id, placement }));
}

function firstText(element: HTMLElement): Text | null {
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
  );
  return walker.nextNode() as Text | null;
}

/** A passage as a range of the page's own text, for the browser to highlight. */
export function rangeOfPlacement(
  editor: LexicalEditor,
  placement: Extract<Placement, { kind: "text" }>,
): Range | null {
  const startElement = editor.getElementByKey(placement.start.key);
  const endElement = editor.getElementByKey(placement.end.key);
  const start = startElement ? firstText(startElement) : null;
  const end = endElement ? firstText(endElement) : null;
  if (!start || !end) return null;
  const range = start.ownerDocument.createRange();
  try {
    range.setStart(start, Math.min(placement.start.offset, start.length));
    range.setEnd(end, Math.min(placement.end.offset, end.length));
  } catch {
    // The text changed under the passage; the next update draws it again.
    return null;
  }
  return range.collapsed ? null : range;
}
