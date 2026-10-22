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

/** The shared blocks a document shows, each once. */
export function sharedIdsOf(document: ContentDocument): string[] {
  return [
    ...new Set(
      (document.root.children ?? []).flatMap((node) =>
        node.type === "shared" && node.sharedId ? [node.sharedId] : [],
      ),
    ),
  ];
}

/**
 * A document with each shared block it shows written out in its place, for
 * a copy that must stand on its own: a page on the school's website, a
 * file taken to another system. A block since taken out leaves nothing.
 */
export function inlineShared(
  document: ContentDocument,
  blocks: ReadonlyMap<string, ContentDocument>,
): ContentDocument {
  const children = document.root.children ?? [];
  if (!children.some((node) => node.type === "shared")) return document;
  return {
    ...document,
    root: {
      ...document.root,
      children: children.flatMap((node) =>
        node.type === "shared"
          ? (blocks.get(node.sharedId ?? "")?.root.children ?? [])
          : [node],
      ),
    },
  };
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
