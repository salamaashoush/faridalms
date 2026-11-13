import { describe, expect, it } from "vitest";

import {
  emphasisedRuns,
  isEmphasised,
  readEmphasis,
  toggleEmphasis,
  writeEmphasis,
} from "./site-emphasis";
import { withoutEmphasis } from "./site-sections";

const select = (text: string, words: string) => {
  const start = text.indexOf(words);
  return [start, start + words.length] as const;
};

describe("toggleEmphasis", () => {
  it("wraps the selected words and keeps them selected", () => {
    const text = "Where every child is known";
    const result = toggleEmphasis(text, ...select(text, "known"));
    expect(result).toEqual({
      text: "Where every child is *known*",
      start: 22,
      end: 27,
    });
  });

  it("unwraps words already emphasised", () => {
    const text = "Where every child is *known*";
    expect(toggleEmphasis(text, ...select(text, "known"))?.text).toBe(
      "Where every child is known",
    );
  });

  it("unwraps a selection that takes in the asterisks too", () => {
    const text = "Where every child is *known*";
    expect(toggleEmphasis(text, 21, 28)?.text).toBe(
      "Where every child is known",
    );
  });

  it("takes the emphasis off only the words selected inside a run", () => {
    const text = "*known and challenged*";
    expect(toggleEmphasis(text, ...select(text, "known"))?.text).toBe(
      "known *and challenged*",
    );
  });

  it("joins a run the selection reaches into", () => {
    const text = "known and *challenged*";
    expect(toggleEmphasis(text, 0, 15)?.text).toBe("*known and challenged*");
  });

  it("joins neighbouring runs into one", () => {
    const text = "*known* *and* challenged";
    expect(toggleEmphasis(text, 0, text.length)?.text).toBe(
      "*known and challenged*",
    );
  });

  it("reads touching marks as one run of emphasis", () => {
    expect(toggleEmphasis("*know**ing* well", 6, 6)?.text).toBe("knowing well");
  });

  it("keeps spaces at the edges of a selection outside the asterisks", () => {
    const text = "a known child";
    expect(toggleEmphasis(text, 1, 8)?.text).toBe("a *known* child");
  });

  it("toggles the word at the caret when nothing is selected", () => {
    expect(toggleEmphasis("every child", 8, 8)?.text).toBe("every *child*");
    expect(toggleEmphasis("every *child*", 9, 9)?.text).toBe("every child");
  });

  it("does nothing on a space with nothing selected", () => {
    expect(toggleEmphasis("every  child", 6, 6)).toBeNull();
  });

  it("emphasises Arabic words, whichever way the selection was made", () => {
    const text = "حيث يُعرف كل طفل";
    const [start, end] = select(text, "يُعرف");
    const forward = toggleEmphasis(text, start, end);
    const backward = toggleEmphasis(text, end, start);
    expect(forward?.text).toBe("حيث *يُعرف* كل طفل");
    expect(backward).toEqual(forward);
    expect(forward ? forward.text.slice(forward.start, forward.end) : "").toBe(
      "يُعرف",
    );
  });

  it("takes a whole Arabic word with its marks from the caret", () => {
    const text = "مدرسة تُعلّم بالتجربة";
    expect(
      toggleEmphasis(text, text.indexOf("ع"), text.indexOf("ع"))?.text,
    ).toBe("مدرسة *تُعلّم* بالتجربة");
  });

  it("refuses a change a lone asterisk would turn into the wrong emphasis", () => {
    const text = "5 * 3 and known";
    expect(toggleEmphasis(text, ...select(text, "known"))).toBeNull();
  });

  it("leaves the words themselves untouched", () => {
    for (const [text, start, end] of [
      ["Learn *by* doing here", 0, 12],
      ["تعلّم *بالتجربة* هنا", 0, 5],
      ["*a* *b* c", 2, 9],
    ] as const) {
      const result = toggleEmphasis(text, start, end);
      expect(result && withoutEmphasis(result.text)).toBe(
        withoutEmphasis(text),
      );
    }
  });
});

describe("isEmphasised", () => {
  it("tells whether the selection or the word at the caret is emphasised", () => {
    const text = "Where *every child* is known";
    expect(isEmphasised(text, ...select(text, "child"))).toBe(true);
    expect(isEmphasised(text, 9, 9)).toBe(true);
    expect(isEmphasised(text, ...select(text, "child is"))).toBe(false);
    expect(isEmphasised(text, ...select(text, "known"))).toBe(false);
    expect(isEmphasised("حيث *يُعرف* كل طفل", 6, 6)).toBe(true);
  });
});

describe("reading and writing emphasis", () => {
  it("round-trips stored text", () => {
    for (const text of ["plain", "a *b* c", "*أ* ب *ج*", "x * y"]) {
      const read = readEmphasis(text);
      expect(writeEmphasis(read.plain, read.emphasised)).toBe(text);
    }
  });

  it("lists the emphasised runs as read", () => {
    expect(emphasisedRuns("Where *every* child is *known*")).toEqual([
      "every",
      "known",
    ]);
    expect(emphasisedRuns("no emphasis")).toEqual([]);
  });
});
