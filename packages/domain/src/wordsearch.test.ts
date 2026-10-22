import { describe, expect, it } from "vitest";

import { crosswordLetters } from "./crossword";
import {
  lettersBetween,
  MAX_SEARCH_SIZE,
  spells,
  squaresAlong,
  wordSearch,
} from "./wordsearch";

const words = (...answers: string[]) =>
  answers.map((answer, index) => ({ id: `w${index + 1}`, answer }));

describe("hiding words in a grid", () => {
  const planets = words("mercury", "venus", "earth", "mars", "jupiter");

  it("hides every word along its line, in a square grid", () => {
    const search = wordSearch(planets, "seed");
    if (!search) throw new Error("no grid");
    const size = search.rows.length;
    expect(search.rows.every((row) => row.length === size)).toBe(true);
    expect(size).toBeLessThanOrEqual(MAX_SEARCH_SIZE);
    for (const word of planets) {
      const line = search.lines[word.id];
      if (!line) throw new Error(`${word.answer} not hidden`);
      expect(
        squaresAlong(line).map(([row, col]) => search.rows[row]?.[col]),
      ).toEqual(crosswordLetters(word.answer));
    }
  });

  it("makes the same grid for the same seed, and another for another", () => {
    expect(wordSearch(planets, "seed")).toEqual(wordSearch(planets, "seed"));
    expect(wordSearch(planets, "seed")?.rows).not.toEqual(
      wordSearch(planets, "other")?.rows,
    );
  });

  it("fills the spare squares with the words' own letters", () => {
    const search = wordSearch(planets, "seed");
    const letters = new Set(
      planets.flatMap((word) => crosswordLetters(word.answer)),
    );
    expect(search?.rows.flat().every((letter) => letters.has(letter))).toBe(
      true,
    );
  });

  it("runs words every way for older students, each still spelled along its line", () => {
    const lines = Array.from({ length: 20 }, (_, index) => {
      const search = wordSearch(planets, `seed-${index}`, true);
      if (!search) throw new Error("no grid");
      for (const word of planets) {
        const line = search.lines[word.id];
        if (!line) throw new Error(`${word.answer} not hidden`);
        const squares = squaresAlong(line);
        expect(squares.map(([row, col]) => search.rows[row]?.[col])).toEqual(
          crosswordLetters(word.answer),
        );
        const [first, last] = [squares[0] ?? [0, 0], squares.at(-1) ?? [0, 0]];
        expect(spells(search.rows, [...first, ...last], word.answer)).toBe(
          true,
        );
      }
      return Object.values(search.lines);
    }).flat();
    expect(lines.some((line) => line.along === -1 || line.down === -1)).toBe(
      true,
    );
    // Without the ask, a young reader's three ways only.
    expect(
      Array.from({ length: 20 }, (_, index) =>
        Object.values(wordSearch(planets, `seed-${index}`)?.lines ?? {}),
      )
        .flat()
        .every((line) => line.along >= 0 && line.down >= 0),
    ).toBe(true);
  });

  it("gives up on a word too long for a phone's grid", () => {
    expect(
      wordSearch(words("a".repeat(MAX_SEARCH_SIZE + 1), "cat"), "s"),
    ).toBeNull();
  });
});

describe("a stretch of squares", () => {
  const rows = [
    ["C", "A", "T"],
    ["X", "O", "X"],
    ["X", "X", "W"],
  ];

  it("reads in a line across, down or on a diagonal, and nowhere else", () => {
    expect(lettersBetween(rows, [0, 0, 0, 2])).toEqual(["C", "A", "T"]);
    expect(lettersBetween(rows, [0, 0, 2, 2])).toEqual(["C", "O", "W"]);
    expect(lettersBetween(rows, [0, 0, 1, 2])).toBeNull();
  });

  it("spells a word read either way", () => {
    expect(spells(rows, [0, 0, 0, 2], "cat")).toBe(true);
    expect(spells(rows, [0, 2, 0, 0], "cat")).toBe(true);
    expect(spells(rows, [2, 2, 0, 0], "cow")).toBe(true);
    expect(spells(rows, [0, 0, 0, 1], "cat")).toBe(false);
  });
});
