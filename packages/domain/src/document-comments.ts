import * as v from "valibot";

import { anchorSchema } from "./anchors";

/**
 * Comments the people writing a document leave each other on its passages.
 * They are kept beside the document, never in it: readers, prints, exports
 * and versions never carry them.
 */

export const MAX_DOCUMENT_COMMENT = 2000;
/** How much of the passage a thread keeps, to say what it was about. */
export const MAX_THREAD_QUOTE = 280;
export const MAX_COMMENT_MENTIONS = 10;

/** The part of a page a thread belongs to when one page edits more than one document, such as a translation. */
export const COMMENT_PART = /^[a-z][a-z0-9_-]{0,39}$/;

const id = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(1));
const hostEntries = {
  hostType: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]{1,62}$/)),
  hostId: id,
};
const body = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(MAX_DOCUMENT_COMMENT),
);
const mentions = v.optional(
  v.pipe(v.array(id), v.maxLength(MAX_COMMENT_MENTIONS)),
  [],
);

export const commentHostSchema = v.object(hostEntries);

export const startThreadSchema = v.object({
  ...hostEntries,
  part: v.optional(v.pipe(v.string(), v.regex(COMMENT_PART)), "body"),
  anchor: anchorSchema,
  quote: v.pipe(v.string(), v.maxLength(MAX_THREAD_QUOTE)),
  body,
  mentions,
});

export const replySchema = v.object({ threadId: id, body, mentions });

export const editCommentSchema = v.object({
  commentId: id,
  expectedVersion: version,
  body,
  mentions,
});

export const removeCommentSchema = v.object({
  commentId: id,
  expectedVersion: version,
});

export const resolveThreadSchema = v.object({
  threadId: id,
  expectedVersion: version,
  resolved: v.boolean(),
});

export const colleaguesSchema = v.object({
  ...hostEntries,
  q: v.pipe(v.string(), v.trim(), v.maxLength(80)),
});

/** The passage a thread keeps, on one line and cut short where it runs long. */
export function quoteOf(words: string): string {
  const line = words.replace(/\s+/g, " ").trim();
  return line.length <= MAX_THREAD_QUOTE
    ? line
    : `${line.slice(0, MAX_THREAD_QUOTE - 1).trimEnd()}…`;
}

/**
 * The people a comment still names: each one picked while writing whose
 * name, after an @, is still in the words. Someone picked and then deleted
 * from the text is not told.
 */
export function mentionedIn(
  text: string,
  picked: readonly { id: string; label: string }[],
): string[] {
  const named = new Set<string>();
  for (const person of picked)
    if (person.label && text.includes(`@${person.label}`)) named.add(person.id);
  return [...named].slice(0, MAX_COMMENT_MENTIONS);
}

/**
 * Threads as the comments panel lists them: open ones first, in the order
 * their passages stand in the document and then those whose passages are
 * gone or elsewhere, oldest first; resolved ones after, the latest resolved
 * first.
 */
export function threadsInOrder<
  T extends { id: string; createdAt: string; resolvedAt: string | null },
>(
  threads: readonly T[],
  placed: readonly string[],
): { open: T[]; resolved: T[] } {
  const position = new Map(placed.map((threadId, index) => [threadId, index]));
  const where = (thread: T) =>
    position.get(thread.id) ?? Number.POSITIVE_INFINITY;
  return {
    open: threads
      .filter((thread) => thread.resolvedAt === null)
      .toSorted(
        (a, b) => where(a) - where(b) || a.createdAt.localeCompare(b.createdAt),
      ),
    resolved: threads
      .filter((thread) => thread.resolvedAt !== null)
      .toSorted((a, b) =>
        (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""),
      ),
  };
}
