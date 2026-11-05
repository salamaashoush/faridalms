import * as v from "valibot";

import type { Capability } from "./capabilities";
import type { ModuleId } from "./modules";

import { MENTION_KINDS } from "./content";

export const SEARCH_KINDS = [
  "students",
  "people",
  "classes",
  "assignments",
  "learning",
  "announcements",
  "news",
  "events",
  "messages",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** Kinds a module owns, found only where the school has it on. */
const KIND_MODULE: Partial<Record<SearchKind, ModuleId>> = {
  assignments: "coursework",
  learning: "elearning",
  news: "news",
};

export const kindOn = (
  kind: SearchKind,
  modules: Record<ModuleId, boolean>,
): boolean => {
  const module = KIND_MODULE[kind];
  return module === undefined || modules[module];
};

/** Hits per kind when every kind is searched at once. */
export const SEARCH_PREVIEW_SIZE = 5;
export const SEARCH_PAGE_SIZE = 20;

const cursor = v.pipe(
  v.string(),
  v.regex(/^\d+(\.\d+)?(e-?\d+)?:[0-9a-f-]{36}$/i),
);

export const searchQuerySchema = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  kind: v.optional(v.picklist(["all", ...SEARCH_KINDS]), "all"),
  /** Where the previous page of one kind ended, as `rank:id`. */
  after: v.optional(cursor),
});
export type SearchQuery = v.InferInput<typeof searchQuerySchema>;

/** Any one of these opens a kind; an empty list means everyone who signs in. */
const KIND_CAPABILITIES: Record<SearchKind, readonly Capability[]> = {
  students: ["people:read"],
  people: ["people:read"],
  classes: ["classes:read"],
  assignments: ["assignments:author", "own-work:read", "children:read"],
  learning: ["learning:author", "learning:read", "children:read"],
  announcements: [],
  news: [],
  events: ["calendar:read"],
  messages: ["messages:read"],
};

export function searchableKinds(
  capabilities: Iterable<Capability>,
): SearchKind[] {
  const held = new Set(capabilities);
  return SEARCH_KINDS.filter((kind) => {
    const needed = KIND_CAPABILITIES[kind];
    return needed.length === 0 || needed.some((one) => held.has(one));
  });
}

/** Which page a hit opens. */
export type SearchTarget =
  | "student"
  | "person"
  | "class"
  | "assignment"
  | "module"
  | "lesson"
  | "announcement"
  | "news"
  | "event"
  | "thread";

/** A state worth showing beside a hit's title. */
export const SEARCH_FLAGS = [
  "draft",
  "scheduled",
  "archived",
  "cancelled",
] as const;
export type SearchFlag = (typeof SEARCH_FLAGS)[number];

export const searchFlagOf = (value: string | null): SearchFlag | null =>
  SEARCH_FLAGS.find((flag) => flag === value) ?? null;

/** Marks around the words that matched inside a snippet. */
export const MATCH_START = "\u0002";
export const MATCH_END = "\u0003";

export interface SearchHit {
  kind: SearchKind;
  target: SearchTarget;
  id: string;
  title: string;
  /** Words around the match, from text the viewer can already read. */
  snippet: string | null;
  /** Where the hit sits: a class, a grade, a role, a module, a place. */
  context: string | null;
  /** ISO date or instant the hit is anchored to, when it has one. */
  when: string | null;
  flag: SearchFlag | null;
  /** The roles a person holds in the school today. */
  roles: string[];
}

export interface SearchGroup {
  kind: SearchKind;
  rows: SearchHit[];
  /** More hits of this kind lie beyond these rows. */
  more: boolean;
}

export interface SearchResult {
  groups: SearchGroup[];
  /** The cursor for the next page when one kind was searched. */
  next: string | null;
}

/** A snippet split into plain and matched runs, for highlighting. */
export function matchedRuns(
  snippet: string,
): { text: string; matched: boolean }[] {
  const runs: { text: string; matched: boolean }[] = [];
  for (const piece of snippet.split(MATCH_START)) {
    const [inside, after] = piece.includes(MATCH_END)
      ? piece.split(MATCH_END, 2)
      : [null, piece];
    if (inside) runs.push({ text: inside, matched: true });
    if (after) runs.push({ text: after, matched: false });
  }
  return runs;
}

/** The mentions in a document whose names its reader asks for as they now stand. */
export const mentionNamesSchema = v.object({
  mentions: v.pipe(
    v.array(
      v.object({
        kind: v.picklist(MENTION_KINDS),
        id: v.pipe(v.string(), v.uuid()),
      }),
    ),
    v.maxLength(200),
  ),
});
