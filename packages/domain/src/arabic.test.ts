import { describe, expect, it } from "vitest";

import type { GapSegment } from "./gaps";

import {
  allWithoutVowelMarks,
  joinedAroundGaps,
  withoutVowelMarks,
} from "./arabic";

const JOINER = String.fromCodePoint(0x200d);

const gap: GapSegment = {
  type: "gap",
  id: "4d0b8e1a-2c5f-4d6e-9a7b-c5d6e7f8a9b0",
  answers: ["ق"],
  options: [],
};

describe("gaps inside Arabic words", () => {
  it("keeps the letters beside a gap joined", () => {
    const [before, , after] = joinedAroundGaps([
      { type: "text", text: "ال" },
      gap,
      { type: "text", text: "مر" },
    ]);
    expect(before).toEqual({ type: "text", text: `ال${JOINER}` });
    expect(after).toEqual({ type: "text", text: `${JOINER}مر` });
  });

  it("leaves spaces and Latin text beside a gap alone", () => {
    const segments: GapSegment[] = [
      { type: "text", text: "Water boils at " },
      gap,
      { type: "text", text: " degrees, في " },
      gap,
    ];
    expect(joinedAroundGaps(segments)).toEqual(segments);
  });
});

describe("vowel marks", () => {
  it("reads Arabic and Hebrew without their vowel marks", () => {
    expect(withoutVowelMarks("كَتَبَ الوَلَدُ")).toBe("كتب الولد");
    expect(withoutVowelMarks("שָׁלוֹם")).toBe("שלום");
    expect(withoutVowelMarks("Read: كِتاب 3")).toBe("Read: كتاب 3");
  });

  it("takes the marks out of every string in a value", () => {
    expect(
      allWithoutVowelMarks({ prompt: "مَا", options: [{ text: "بَيت" }] }),
    ).toEqual({ prompt: "ما", options: [{ text: "بيت" }] });
  });
});
