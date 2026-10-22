import * as v from "valibot";

import type { ContentDocument, ContentNode } from "./content";

import { contentDocumentSchema } from "./content";

export const SHARED_SCOPES = ["mine", "school"] as const;
export type SharedScope = (typeof SHARED_SCOPES)[number];
export const MAX_SHARED_TITLE = 120;

const id = v.pipe(v.string(), v.uuid());

/**
 * Blocks a shared block may not hold. A question is answered and marked in
 * the one lesson that asks it, a gate or a draw belongs to the order of one
 * document, and a shared block within another would let one edit reach
 * further than its teacher sees.
 */
const NOT_SHARED = new Set(["question", "gate", "draw", "shared", "starter"]);

const holds = (node: ContentNode, types: ReadonlySet<string>): boolean =>
  types.has(node.type) ||
  (node.children ?? []).some((child) => holds(child, types));

/** Whether a document may be kept as a shared block: some words, and nothing a shared block may not hold. */
export function sharable(document: ContentDocument): boolean {
  const children = document.root.children ?? [];
  return (
    children.length > 0 && !children.some((child) => holds(child, NOT_SHARED))
  );
}

export const saveSharedSchema = v.object({
  /** Empty to keep a new shared block, or the one being changed. */
  id: v.optional(v.union([v.literal(""), id]), ""),
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
  title: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "shared.title_needed"),
    v.maxLength(MAX_SHARED_TITLE),
  ),
  scope: v.picklist(SHARED_SCOPES),
  content: v.pipe(
    contentDocumentSchema,
    v.check((document) => sharable(document), "shared.content"),
  ),
});
export type SaveShared = v.InferOutput<typeof saveSharedSchema>;

export const sharedQuerySchema = v.object({
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  scope: v.optional(v.picklist(["all", ...SHARED_SCOPES]), "all"),
});
export type SharedQuery = v.InferOutput<typeof sharedQuerySchema>;

export const sharedRefSchema = v.object({ id });
