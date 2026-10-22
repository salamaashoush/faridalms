import type { ContentDocument, ContentNode } from "./content";

import { foldAnswer } from "./answers";

/** A word or phrase a document defines, with what it means and how it is shown. */
export interface GlossaryEntry {
  words: string;
  definition: string;
  gloss?: string;
  fileId?: string;
  alt?: string;
}

/** A term's words as they compare: Arabic marks, letter forms and case aside. */
export const termKey = (words: string) => foldAnswer(words);

/** A term node as an entry, its words read from its text. */
export function termEntry(node: ContentNode): GlossaryEntry {
  return {
    words: (node.children ?? [])
      .map((child) => child.text ?? "")
      .join("")
      .trim(),
    definition: node.definition ?? "",
    ...(node.gloss ? { gloss: node.gloss } : {}),
    ...(node.fileId ? { fileId: node.fileId, alt: node.alt ?? "" } : {}),
  };
}

/**
 * The terms a document defines, in reading order, as its terms stand
 * wherever they are, a quote, a list or a column.
 */
export function documentTerms(document: ContentDocument): GlossaryEntry[] {
  const found: GlossaryEntry[] = [];
  const pending = [document.root];
  for (let node = pending.shift(); node; node = pending.shift()) {
    if (node.type === "term") found.push(termEntry(node));
    else if (node.children) pending.unshift(...node.children);
  }
  return found;
}

/** The terms of a document handed out in parts, as a lesson's blocks are. */
export function partsTerms(
  parts: readonly { type: string; content?: ContentDocument }[],
): GlossaryEntry[] {
  return parts.flatMap((part) =>
    part.type === "content" && part.content ? documentTerms(part.content) : [],
  );
}

/**
 * A glossary from the terms a document defines: each word once, defined as
 * where it is first defined, in the alphabetical order of the reader's
 * language. A term still without a definition is left out.
 */
export function glossaryOf<T extends GlossaryEntry>(
  entries: readonly T[],
  locale: string,
): T[] {
  const kept = new Map<string, T>();
  for (const entry of entries) {
    const key = termKey(entry.words);
    if (key && entry.definition.trim() && !kept.has(key)) kept.set(key, entry);
  }
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return [...kept.values()].toSorted((a, b) =>
    collator.compare(a.words, b.words),
  );
}
