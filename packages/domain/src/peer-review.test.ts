import { describe, expect, it } from "vitest";

import { allocateReviews } from "./peer-review";
import { seededRandom } from "./seeded";

const counts = (
  pairs: readonly { reviewerId: string; authorId: string }[],
  side: "reviewerId" | "authorId",
) => {
  const out = new Map<string, number>();
  for (const pair of pairs) out.set(pair[side], (out.get(pair[side]) ?? 0) + 1);
  return out;
};

describe("allocateReviews", () => {
  const class6 = ["a", "b", "c", "d", "e", "f"];

  it("has every student give and receive the same number, never their own", () => {
    const pairs = allocateReviews({
      existing: [],
      students: class6,
      reviews: 2,
      random: seededRandom("ring"),
    });
    expect(pairs).toHaveLength(12);
    expect(pairs.every((pair) => pair.reviewerId !== pair.authorId)).toBe(true);
    expect(
      new Set(pairs.map((p) => `${p.reviewerId}:${p.authorId}`)).size,
    ).toBe(12);
    for (const student of class6) {
      expect(counts(pairs, "reviewerId").get(student)).toBe(2);
      expect(counts(pairs, "authorId").get(student)).toBe(2);
    }
  });

  it("asks no more reviews than there are classmates", () => {
    const pairs = allocateReviews({
      existing: [],
      students: ["a", "b"],
      reviews: 3,
    });
    expect(
      pairs.toSorted((x, y) => x.reviewerId.localeCompare(y.reviewerId)),
    ).toEqual([
      { reviewerId: "a", authorId: "b" },
      { reviewerId: "b", authorId: "a" },
    ]);
    expect(
      allocateReviews({ existing: [], students: ["a"], reviews: 2 }),
    ).toEqual([]);
  });

  it("brings late work in with the classmates who have the fewest", () => {
    const existing = allocateReviews({
      existing: [],
      students: class6,
      reviews: 2,
      random: seededRandom("first"),
    });
    const added = allocateReviews({
      existing,
      students: [...class6, "g"],
      reviews: 2,
      random: seededRandom("late"),
    });
    expect(added.filter((pair) => pair.reviewerId === "g")).toHaveLength(2);
    expect(added.filter((pair) => pair.authorId === "g")).toHaveLength(2);
    expect(added.every((pair) => pair.reviewerId !== pair.authorId)).toBe(true);
    const all = [...existing, ...added];
    const received = counts(all, "authorId");
    expect(
      Math.max(...received.values()) - Math.min(...received.values()),
    ).toBe(1);
    // Students already in the review are not given again.
    expect(
      allocateReviews({
        existing: all,
        students: [...class6, "g"],
        reviews: 2,
      }),
    ).toEqual([]);
  });
});
