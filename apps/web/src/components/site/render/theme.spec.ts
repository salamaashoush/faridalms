import { THEMES } from "@faridalms/domain/site-theme";
import { describe, expect, it } from "vitest";

import { schemeStyle, standoutStyle } from "./theme";

describe("Arabic's form of the italic emphasis", () => {
  it("takes the scheme's standout colour at the heading's own weight", () => {
    expect(standoutStyle("light", "#b1523c")).toEqual({
      "--s-standout-light": "#b1523c",
      "--s-standout-weight-light": "var(--s-heading-weight)",
    });
  });

  it("takes a heavier weight where no colour reads apart from the heading", () => {
    expect(standoutStyle("dark", null)).toEqual({
      "--s-standout-dark": "currentColor",
      "--s-standout-weight-dark": "700",
    });
  });

  it("is set on every scheme in both modes, so no section inherits another's", () => {
    const style = schemeStyle(THEMES.atelier, "accent") as Record<
      string,
      unknown
    >;
    for (const name of [
      "--s-standout-light",
      "--s-standout-weight-light",
      "--s-standout-dark",
      "--s-standout-weight-dark",
    ])
      expect(style[name]).toBeTruthy();
    expect(
      (schemeStyle(THEMES.atelier, "canvas") as Record<string, unknown>)[
        "--s-standout-light"
      ],
    ).not.toBe("currentColor");
  });
});
