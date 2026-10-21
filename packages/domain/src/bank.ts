import * as v from "valibot";

import type { ContentDocument, ContentNode } from "./content";

import { contentDocumentSchema, questionKinds } from "./content";

export const BANK_SCOPES = ["mine", "school"] as const;
export type BankScope = (typeof BANK_SCOPES)[number];
export const MAX_BANK_TAGS = 8;
export const MAX_BANK_TAG = 40;

const id = v.pipe(v.string(), v.uuid());

const tag = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(MAX_BANK_TAG),
);

/** The one question a bank document holds, or null when it holds anything else. */
export function bankQuestionOf(document: ContentDocument): ContentNode | null {
  const children = document.root.children ?? [];
  const [only] = children;
  return children.length === 1 && only?.type === "question" ? only : null;
}

export const saveBankQuestionSchema = v.object({
  /** Empty to keep a new question, or the one being changed. */
  id: v.optional(v.union([v.literal(""), id]), ""),
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
  scope: v.picklist(BANK_SCOPES),
  tags: v.pipe(
    v.array(tag),
    v.maxLength(MAX_BANK_TAGS),
    v.transform((tags) => [...new Set(tags)]),
  ),
  content: v.pipe(
    contentDocumentSchema,
    v.check(
      (document) => bankQuestionOf(document) !== null,
      "bank.one_question",
    ),
  ),
});
export type SaveBankQuestion = v.InferOutput<typeof saveBankQuestionSchema>;

export const bankQuerySchema = v.object({
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  tag: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(MAX_BANK_TAG)), ""),
  kind: v.optional(v.union([v.literal(""), v.picklist(questionKinds)]), ""),
  scope: v.optional(v.picklist(["all", ...BANK_SCOPES]), "all"),
});
export type BankQuery = v.InferOutput<typeof bankQuerySchema>;

export const bankRefSchema = v.object({ id });
