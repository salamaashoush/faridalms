import { toggleEmphasis } from "@faridalms/domain/site-emphasis";
import { describe, expect, it } from "vitest";

import {
  drawnOffset,
  drawnRuns,
  nearLimit,
  storedFrom,
  storedOffset,
  textRule,
  typedAfterEmphasis,
  typedWords,
} from "./canvas-text";

describe("the words a field draws on the canvas", () => {
  it("draws a heading without its asterisks, the set-apart words marked", () => {
    expect(drawnRuns("Where every child is *known*", true)).toEqual([
      { words: "Where every child is ", emphasised: false },
      { words: "known", emphasised: true },
    ]);
    expect(drawnRuns("عقول فضولية و*مستقبل* عالمي", true)).toEqual([
      { words: "عقول فضولية و", emphasised: false },
      { words: "مستقبل", emphasised: true },
      { words: " عالمي", emphasised: false },
    ]);
  });

  it("draws words that are not a heading's as they are stored", () => {
    expect(drawnRuns("Ages *3* to 18", false)).toEqual([
      { words: "Ages *3* to 18", emphasised: false },
    ]);
    expect(drawnRuns("", true)).toEqual([]);
  });

  it("stores drawn words back as they were, in either script", () => {
    for (const stored of [
      "Curious minds, *global* futures",
      "*Learn* by doing",
      "عقول فضولية ومستقبل *عالمي*",
      "مدرسة *Northwind* الدولية",
      "Plain words",
    ])
      expect(storedFrom(drawnRuns(stored, true), true)).toBe(stored);
  });

  it("keeps a space typed at the edge of set-apart words outside the asterisks", () => {
    expect(
      storedFrom(
        [
          { words: "Curious ", emphasised: false },
          { words: "minds ", emphasised: true },
        ],
        true,
      ),
    ).toBe("Curious *minds* ");
  });
});

describe("words typed beside set-apart words", () => {
  it("keeps words typed where the emphasis closes outside it, as the panel does", () => {
    const typed = [
      { words: "of the ", emphasised: false },
      { words: "heart today", emphasised: true },
    ];
    expect(storedFrom(typedAfterEmphasis(typed, 18, 6), true)).toBe(
      "of the *heart* today",
    );
  });

  it("keeps Arabic typed after set-apart words outside them too", () => {
    const typed = [
      { words: "ويهذب ", emphasised: false },
      { words: "القلب اليوم", emphasised: true },
    ];
    expect(storedFrom(typedAfterEmphasis(typed, 17, 6), true)).toBe(
      "ويهذب *القلب* اليوم",
    );
  });

  it("leaves words typed inside set-apart words in them", () => {
    const typed = [
      { words: "of the ", emphasised: false },
      { words: "hearty", emphasised: true },
      { words: " school", emphasised: false },
    ];
    expect(typedAfterEmphasis(typed, 12, 1)).toEqual(typed);
    expect(typedAfterEmphasis(typed, 3, 1)).toEqual(typed);
  });
});

describe("the caret between the drawn words and the stored text", () => {
  const stored = "Curious minds, *global* futures";

  it("maps a point in the drawn words past the asterisks before it", () => {
    expect(storedOffset(stored, 0, true)).toBe(0);
    expect(storedOffset(stored, 15, true)).toBe(16);
    expect(storedOffset(stored, 21, true)).toBe(23);
    expect(storedOffset(stored, 29, true)).toBe(stored.length);
  });

  it("maps a point in the stored text back among the drawn words", () => {
    expect(drawnOffset(stored, 16, true)).toBe(15);
    expect(drawnOffset(stored, 15, true)).toBe(15);
    expect(drawnOffset(stored, stored.length, true)).toBe(29);
  });

  it("maps Arabic offsets the same way, whichever way the script runs", () => {
    const arabic = "تعلّم *بالتجربة*";
    expect(storedOffset(arabic, 6, true)).toBe(7);
    expect(drawnOffset(arabic, 7, true)).toBe(6);
    expect(storedOffset(arabic, 14, true)).toBe(arabic.length);
  });

  it("toggles the words a drawn selection covers as the panel's button does", () => {
    const start = storedOffset(stored, 22, true);
    const end = storedOffset(stored, 29, true);
    const result = toggleEmphasis(stored, start, end);
    expect(result?.text).toBe("Curious minds, *global* *futures*");
    expect(
      result && [
        drawnOffset(result.text, result.start, true),
        drawnOffset(result.text, result.end, true),
      ],
    ).toEqual([22, 29]);
  });

  it("toggles a backwards Arabic selection by its ends, not its direction", () => {
    const arabic = "تعلّم بالتجربة";
    const result = toggleEmphasis(
      arabic,
      storedOffset(arabic, 6, true),
      storedOffset(arabic, 14, true),
    );
    expect(result?.text).toBe("تعلّم *بالتجربة*");
  });

  it("maps words drawn as stored one to one", () => {
    expect(storedOffset("a *b*", 3, false)).toBe(3);
    expect(drawnOffset("a *b*", 9, false)).toBe(5);
  });
});

describe("the rules typed words keep", () => {
  it("reads a field's limit and lines from the section's declaration", () => {
    expect(textRule("hero", "heading")).toEqual({
      max: 200,
      multiline: false,
    });
    expect(textRule("hero", "text")).toEqual({ max: 500, multiline: true });
    expect(textRule("hero", "eyebrow")).toEqual({
      max: 80,
      multiline: false,
    });
    expect(textRule("text", "body")).toBeNull();
    expect(textRule("hero", "missing")).toBeNull();
  });

  it("keeps no line break in a single-line field, as its input would not", () => {
    expect(typedWords("Open\nmorning", { max: 80, multiline: false })).toBe(
      "Openmorning",
    );
    expect(typedWords("سطر\nثانٍ", { max: 500, multiline: true })).toBe(
      "سطر\nثانٍ",
    );
  });

  it("is near the limit past four fifths of it, as the panel's count is", () => {
    expect(nearLimit(160, { max: 200, multiline: false })).toBe(false);
    expect(nearLimit(161, { max: 200, multiline: false })).toBe(true);
  });
});
