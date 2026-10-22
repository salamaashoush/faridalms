import { describe, expect, it } from "vitest";

import {
  crosswordLayout,
  crosswordLetters,
  graphemes,
  MAX_CROSSWORD_SIZE,
  squaresOf,
} from "./crossword";

const words = (...answers: string[]) =>
  answers.map((answer, index) => ({ id: `w${index + 1}`, answer }));

/** Each square's letter, from every word laid over it. */
function grid(answers: string[]) {
  const layout = crosswordLayout(words(...answers));
  if (!layout) throw new Error("no layout");
  const squares = new Map<string, string>();
  for (const entry of layout.entries) {
    const letters = crosswordLetters(
      answers[Number(entry.id.slice(1)) - 1] ?? "",
    );
    squaresOf(entry).forEach((key, index) => {
      const letter = letters[index] ?? "";
      expect(squares.get(key) ?? letter).toBe(letter);
      squares.set(key, letter);
    });
  }
  return { layout, squares };
}

describe("crossword letters", () => {
  it("keeps letters alone, in capitals, folding Arabic as typed answers fold", () => {
    expect(crosswordLetters("sea-horse")).toEqual(graphemes("SEAHORSE"));
    expect(crosswordLetters("أَسَد")).toEqual(["ا", "س", "د"]);
  });
});

describe("laying a crossword out", () => {
  it("crosses every word with another, each square holding one letter", () => {
    const planets = ["planet", "orbit", "moon", "star", "comet", "earth"];
    const { layout, squares } = grid(planets);
    expect(layout.entries).toHaveLength(planets.length);
    expect(new Set(layout.entries.map((entry) => entry.id)).size).toBe(
      planets.length,
    );
    // Every word shares a square, so the grid holds fewer squares than letters.
    expect(squares.size).toBeLessThan(planets.join("").length);
    expect(layout.width).toBeLessThanOrEqual(MAX_CROSSWORD_SIZE);
  });

  it("numbers words in reading order, one number for words that start together", () => {
    const { layout } = grid(["river", "delta", "sea"]);
    const numbers = layout.entries.map((entry) => entry.number);
    expect(numbers).toEqual(numbers.toSorted((a, b) => a - b));
    expect(numbers[0]).toBe(1);
    const first = layout.entries.find((entry) => entry.number === 1);
    expect(first).toMatchObject({ row: 0 });
  });

  it("lays the same words out the same way every time", () => {
    expect(crosswordLayout(words("river", "delta", "nile"))).toEqual(
      crosswordLayout(words("river", "delta", "nile")),
    );
  });

  it("gives up on a word that crosses none of the others", () => {
    expect(crosswordLayout(words("cat", "dog"))).toBeNull();
    expect(crosswordLayout(words("a", "cat"))).toBeNull();
  });

  it("lays Arabic words out as their letters cross", () => {
    const { layout } = grid(["القاهرة", "النيل", "مصر", "الأهرام", "البحر"]);
    expect(layout.entries).toHaveLength(5);
  });
});
