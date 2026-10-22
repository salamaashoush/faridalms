import type { CitationRun, CitationStyle, FootnoteSource } from "./citations";
import type { ContentDocument } from "./content";

import { formatReference } from "./citations";

/** The sources a document's footnotes cite, in reading order, wherever they stand. */
export function documentSources(document: ContentDocument): FootnoteSource[] {
  const found: FootnoteSource[] = [];
  const pending = [document.root];
  for (let node = pending.shift(); node; node = pending.shift()) {
    if (node.type === "footnote" && node.source) found.push(node.source);
    else if (node.children) pending.unshift(...node.children);
  }
  return found;
}

/** The sources of a document handed out in parts, as a lesson's blocks are. */
export function partsSources(
  parts: readonly { type: string; content?: ContentDocument }[],
): FootnoteSource[] {
  return parts.flatMap((part) =>
    part.type === "content" && part.content
      ? documentSources(part.content)
      : [],
  );
}

/** How many footnotes a document holds, wherever they stand. */
export function footnoteCount(document: ContentDocument): number {
  let count = 0;
  const pending = [document.root];
  for (let node = pending.shift(); node; node = pending.shift()) {
    if (node.type === "footnote") count += 1;
    else if (node.children) pending.unshift(...node.children);
  }
  return count;
}

/**
 * How many footnotes come before each part of a document handed out in
 * parts, by the part's document, so the numbers run on from part to part
 * as they would on one page.
 */
export function partsNotesBefore(
  parts: readonly { type: string; content?: ContentDocument }[],
): Map<ContentDocument, number> {
  const before = new Map<ContentDocument, number>();
  let count = 0;
  for (const part of parts)
    if (part.type === "content" && part.content) {
      before.set(part.content, count);
      count += footnoteCount(part.content);
    }
  return before;
}

/** One source however often it is cited, at whatever page. */
const keyOf = (source: FootnoteSource) =>
  [
    source.kind,
    source.authors,
    source.title,
    source.container,
    source.date,
    source.volume,
    source.issue,
    source.url,
  ]
    .map((part) => part.trim().toLocaleLowerCase())
    .join("\u0000");

/** What a source sorts by: its first author's last name, else its title. */
const sortName = (source: FootnoteSource) =>
  source.authors.split(/[;؛]/u)[0]?.split(/[,،]/u)[0]?.trim() ||
  source.title.trim();

export interface Bibliography {
  /** The style most of its sources are cited in, which names the list. */
  style: CitationStyle;
  entries: CitationRun[][];
}

/**
 * A reference list of the sources a document cites: each once however
 * often it is cited, in the alphabetical order of its first author, or of
 * its title where it names none, each as its style's list gives it. Null
 * while nothing cited names an author or a title.
 */
export function bibliographyOf(
  sources: readonly FootnoteSource[],
  locale: string,
): Bibliography | null {
  const kept = new Map<string, FootnoteSource>();
  const uses = new Map<CitationStyle, number>();
  for (const source of sources) {
    if (!source.authors.trim() && !source.title.trim()) continue;
    uses.set(source.style, (uses.get(source.style) ?? 0) + 1);
    const key = keyOf(source);
    if (!kept.has(key)) kept.set(key, source);
  }
  if (kept.size === 0) return null;
  const collator = new Intl.Collator(locale, {
    sensitivity: "base",
    numeric: true,
  });
  const ordered = [...kept.values()].toSorted(
    (a, b) =>
      collator.compare(sortName(a), sortName(b)) ||
      collator.compare(a.date, b.date) ||
      collator.compare(a.title, b.title),
  );
  // A tie goes to the style cited first, as the counts were met in reading order.
  let style: CitationStyle = "apa";
  let most = 0;
  for (const [each, count] of uses)
    if (count > most) {
      style = each;
      most = count;
    }
  return {
    style,
    entries: ordered.map((source) => formatReference(source, locale)),
  };
}
