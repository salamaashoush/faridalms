import * as v from "valibot";

/**
 * One end of a passage in a document: the block it falls in and how many
 * characters of the block's own text come before it. A place kept this way
 * survives edits elsewhere, and edits in its block before it only shift it.
 */
export const anchorPointSchema = v.object({
  block: v.pipe(v.string(), v.regex(/^[\da-z]{8,36}$/)),
  offset: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100000)),
});
export type AnchorPoint = v.InferOutput<typeof anchorPointSchema>;

/** A passage from one point to another; both in one block with no length marks the whole block. */
export const anchorSchema = v.object({
  start: anchorPointSchema,
  end: anchorPointSchema,
});
export type Anchor = v.InferOutput<typeof anchorSchema>;

/**
 * Which of two points comes first in a document whose blocks stand in
 * `order`: negative, zero or positive. A block the document no longer holds
 * sorts after every other.
 */
export function comparePoints(
  a: AnchorPoint,
  b: AnchorPoint,
  order: ReadonlyMap<string, number>,
): number {
  const from = order.get(a.block) ?? Number.POSITIVE_INFINITY;
  const to = order.get(b.block) ?? Number.POSITIVE_INFINITY;
  if (from !== to) return from < to ? -1 : 1;
  return a.offset - b.offset;
}

/** An anchor that marks a block as a whole rather than words in it. */
export function wholeBlock(anchor: Anchor): boolean {
  return (
    anchor.start.block === anchor.end.block &&
    anchor.start.offset === anchor.end.offset
  );
}

/**
 * Whether a point falls in the passage: between its ends, either end
 * included, or anywhere in the block an anchor marks as a whole.
 */
export function anchorContains(
  anchor: Anchor,
  point: AnchorPoint,
  order: ReadonlyMap<string, number>,
): boolean {
  if (wholeBlock(anchor)) return point.block === anchor.start.block;
  return (
    comparePoints(anchor.start, point, order) <= 0 &&
    comparePoints(point, anchor.end, order) <= 0
  );
}
