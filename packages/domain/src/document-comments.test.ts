import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  MAX_THREAD_QUOTE,
  mentionedIn,
  quoteOf,
  startThreadSchema,
  threadsInOrder,
} from "./document-comments";

const thread = (
  id: string,
  createdAt: string,
  resolvedAt: string | null = null,
) => ({ id, createdAt, resolvedAt });

describe("document comments", () => {
  it("keeps a passage on one line and cuts a long one short", () => {
    expect(quoteOf("  The Nile\n floods   in summer ")).toBe(
      "The Nile floods in summer",
    );
    const long = quoteOf("word ".repeat(200));
    expect(long).toHaveLength(MAX_THREAD_QUOTE);
    expect(long.endsWith("…")).toBe(true);
  });

  it("tells only the people whose names are still in the words", () => {
    const picked = [
      { id: "a", label: "Salama Ashoush" },
      { id: "b", label: "Acme Teacher" },
      { id: "a", label: "Salama Ashoush" },
    ];
    expect(
      mentionedIn("@Salama Ashoush could you check this?", picked),
    ).toEqual(["a"]);
    expect(mentionedIn("Salama Ashoush, no at sign", picked)).toEqual([]);
  });

  it("lists open threads by where their passages stand, then resolved ones latest first", () => {
    const threads = [
      thread("lost", "2026-11-01T09:00:00.000Z"),
      thread("second", "2026-11-01T08:00:00.000Z"),
      thread("first", "2026-11-02T08:00:00.000Z"),
      thread("old", "2026-11-01T07:00:00.000Z", "2026-11-03T08:00:00.000Z"),
      thread("late", "2026-11-01T07:30:00.000Z", "2026-11-04T08:00:00.000Z"),
    ];
    const { open, resolved } = threadsInOrder(threads, ["first", "second"]);
    expect(open.map((row) => row.id)).toEqual(["first", "second", "lost"]);
    expect(resolved.map((row) => row.id)).toEqual(["late", "old"]);
  });

  it("starts a thread in the document's body unless a part is named", () => {
    const input = {
      hostType: "lesson",
      hostId: "0190a3c4-5b6d-7e8f-9a0b-1c2d3e4f5a6b",
      anchor: {
        start: { block: "p0x1zzzz", offset: 0 },
        end: { block: "p0x1zzzz", offset: 4 },
      },
      quote: "Nile",
      body: "  Is this the right river?  ",
    };
    const parsed = v.parse(startThreadSchema, input);
    expect(parsed.part).toBe("body");
    expect(parsed.body).toBe("Is this the right river?");
    expect(parsed.mentions).toEqual([]);
    expect(v.is(startThreadSchema, { ...input, part: "Not A Part" })).toBe(
      false,
    );
    expect(v.is(startThreadSchema, { ...input, body: "   " })).toBe(false);
  });
});
