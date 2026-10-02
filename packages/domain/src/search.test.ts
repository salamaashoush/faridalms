import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  MATCH_END,
  MATCH_START,
  matchedRuns,
  searchableKinds,
  searchQuerySchema,
} from "./search";

describe("searchableKinds", () => {
  it("gives a family its children's work, the news, the calendar and messages", () => {
    expect(
      searchableKinds([
        "children:read",
        "calendar:read",
        "messages:read",
        "assignments:read",
      ]),
    ).toEqual([
      "assignments",
      "learning",
      "announcements",
      "news",
      "events",
      "messages",
    ]);
  });

  it("opens people and classes only to staff who may read them", () => {
    expect(
      searchableKinds(["people:read", "classes:read", "assignments:author"]),
    ).toEqual([
      "students",
      "people",
      "classes",
      "assignments",
      "announcements",
      "news",
    ]);
  });

  it("leaves only the school's news to someone with no capability", () => {
    expect(searchableKinds([])).toEqual(["announcements", "news"]);
  });
});

describe("search queries", () => {
  it("take a trimmed query and a cursor made of a rank and an id", () => {
    const parsed = v.parse(searchQuerySchema, {
      q: "  Salma ",
      kind: "students",
      after: "0.31:01a0e2ff-cde5-7007-9a57-82ae313cc17a",
    });
    expect(parsed).toEqual({
      q: "Salma",
      kind: "students",
      after: "0.31:01a0e2ff-cde5-7007-9a57-82ae313cc17a",
    });
    expect(
      v.safeParse(searchQuerySchema, { q: "x", after: "drop table" }).success,
    ).toBe(false);
  });
});

describe("matchedRuns", () => {
  it("splits a snippet into plain words and matched words", () => {
    expect(
      matchedRuns(`Bring your ${MATCH_START}kit${MATCH_END} on Monday`),
    ).toEqual([
      { text: "Bring your ", matched: false },
      { text: "kit", matched: true },
      { text: " on Monday", matched: false },
    ]);
  });
});
