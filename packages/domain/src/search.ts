import * as v from "valibot";

import type { Permission } from "./identity";

export const SEARCH_KINDS = [
  "students",
  "classes",
  "people",
  "assignments",
  "messages",
  "events",
  "newsletters",
  "announcements",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_PAGE_SIZE = 10;
/** Hits per group when every kind is searched at once. */
export const SEARCH_PREVIEW_SIZE = 5;

export const searchQuerySchema = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  kind: v.optional(v.picklist(["all", ...SEARCH_KINDS]), "all"),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});
export type SearchQuery = v.InferOutput<typeof searchQuerySchema>;

/** Any one of these capabilities opens the kind; people and announcements need none. */
const KIND_PERMISSIONS: Record<SearchKind, readonly Permission[]> = {
  students: ["student-profile:read"],
  classes: ["classes:read", "student-profile:read"],
  people: [],
  assignments: ["assignments:read"],
  messages: ["messages:read"],
  events: ["calendar:read"],
  newsletters: ["newsletters:read"],
  announcements: [],
};

export function searchableKinds(
  permissions: readonly Permission[],
): SearchKind[] {
  return SEARCH_KINDS.filter((kind) => {
    const needed = KIND_PERMISSIONS[kind];
    return (
      needed.length === 0 ||
      needed.some((permission) => permissions.includes(permission))
    );
  });
}

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string | null;
  context: string | null;
  /** ISO date or instant the hit is anchored to, when the kind has one. */
  when: string | null;
}

export interface SearchGroup {
  kind: SearchKind;
  total: number;
  rows: SearchHit[];
}
