/**
 * Places in a document drawn by the reader, kept as a block id and a count
 * of the document's own characters before the place. Only text the reader
 * marks as the document's counts, so the same place resolves in either
 * language whatever labels surround it.
 */
export interface AnchorPoint {
  block: string;
  offset: number;
}

export interface Anchor {
  start: AnchorPoint;
  end: AnchorPoint;
}

const BLOCK = "[data-block-id]";
const TEXT = "[data-fe-text]";

const blockOf = (text: Text) => text.parentElement?.closest(BLOCK) ?? null;

/** The document's text nodes under `root`, in reading order. */
function textsIn(root: Element): Text[] {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) =>
        node.parentElement?.closest(TEXT) && blockOf(node as Text)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    },
  );
  const found: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    found.push(node as Text);
  return found;
}

function pointOf(text: Text, offset: number): AnchorPoint | null {
  const block = blockOf(text);
  const id = block?.getAttribute("data-block-id");
  if (!block || !id) return null;
  let before = 0;
  for (const other of textsIn(block)) {
    if (blockOf(other) !== block) continue;
    if (other === text) return { block: id, offset: before + offset };
    before += other.length;
  }
  return null;
}

/**
 * The text node and offset a range boundary falls at, moved into the
 * nearest of the document's own text: forward for a start, back for an end.
 */
function textBoundary(
  texts: Text[],
  node: Node,
  offset: number,
  side: "start" | "end",
): [Text, number] | null {
  if (node.nodeType === Node.TEXT_NODE && texts.includes(node as Text))
    return [node as Text, offset];
  const probe = node.ownerDocument?.createRange();
  if (!probe) return null;
  probe.setStart(node, offset);
  if (side === "start") {
    for (const text of texts)
      if (probe.comparePoint(text, text.length) >= 0) {
        return probe.comparePoint(text, 0) >= 0 ? [text, 0] : null;
      }
    return null;
  }
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = texts[index];
    if (text && probe.comparePoint(text, 0) <= 0) return [text, text.length];
  }
  return null;
}

/** Where a selection inside `root` sits, or null when it holds none of the document's text. */
export function anchorOf(root: Element, range: Range): Anchor | null {
  const texts = textsIn(root);
  const start = textBoundary(
    texts,
    range.startContainer,
    range.startOffset,
    "start",
  );
  const end = textBoundary(texts, range.endContainer, range.endOffset, "end");
  if (!start || !end) return null;
  const order = start[0].compareDocumentPosition(end[0]);
  if (
    order & Node.DOCUMENT_POSITION_PRECEDING ||
    (start[0] === end[0] && start[1] >= end[1])
  )
    return null;
  const from = pointOf(...start);
  const to = pointOf(...end);
  return from && to ? { start: from, end: to } : null;
}

function locate(
  root: Element,
  point: AnchorPoint,
  side: "start" | "end",
): [Text, number] | null {
  const block = root.querySelector(
    `[data-block-id="${CSS.escape(point.block)}"]`,
  );
  if (!block) return null;
  let before = 0;
  let last: Text | null = null;
  for (const text of textsIn(block)) {
    if (blockOf(text) !== block) continue;
    const after = before + text.length;
    if (side === "start" ? point.offset < after : point.offset <= after)
      return [text, point.offset - before];
    before = after;
    last = text;
  }
  return last && point.offset === before ? [last, last.length] : null;
}

/** The range an anchor points at in `root`, or null when the text is not there. */
export function rangeOf(root: Element, anchor: Anchor): Range | null {
  const start = locate(root, anchor.start, "start");
  const end = locate(root, anchor.end, "end");
  if (!start || !end) return null;
  const range = root.ownerDocument.createRange();
  range.setStart(...start);
  range.setEnd(...end);
  return range.collapsed ? null : range;
}

/** The document's own words inside a range, without the labels around them. */
export function wordsIn(root: Element, range: Range): string {
  return textsIn(root)
    .filter((text) => range.intersectsNode(text))
    .map((text) => {
      const from = text === range.startContainer ? range.startOffset : 0;
      const to = text === range.endContainer ? range.endOffset : text.length;
      return text.data.slice(from, to);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** All of a block's own text, for a comment on the block as a whole. */
export function blockAnchor(root: Element, block: string): Anchor | null {
  const element = root.querySelector(`[data-block-id="${CSS.escape(block)}"]`);
  if (!element) return null;
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(element);
  return anchorOf(root, range);
}
