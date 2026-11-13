import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  bandContrast,
  bandText,
  brandColourSchema,
  brandReadable,
  faintBandText,
  portalColour,
  readableBrand,
  READABLE,
} from "./brand";
import { contrast } from "./site-theme";

describe("a school's brand colour", () => {
  it("is six hex digits, kept in capitals", () => {
    expect(v.parse(brandColourSchema, " #0b3d91 ")).toBe("#0B3D91");
    for (const wrong of ["0B3D91", "#0B3D9", "#0B3D911", "#GGGGGG", "blue"])
      expect(v.safeParse(brandColourSchema, wrong).success).toBe(false);
  });

  it("puts white words on a dark colour and near black on a light one", () => {
    expect(bandText("#0B3D91")).toBe("#FFFFFF");
    expect(bandText("#FFD60A")).toBe("#111111");
  });

  it("blends the band's faint words over the colour as the browser does", () => {
    expect(faintBandText("#000000")).toBe("#BFBFBF");
    expect(faintBandText("#FFFFFF")).toBe("#4D4D4D");
  });

  it("reads where the faintest words on the band meet AA, and not where they fall short", () => {
    expect(brandReadable("#0B3D91")).toBe(true);
    expect(brandReadable("#6D28D9")).toBe(true);
    expect(brandReadable("#FFD60A")).toBe(true);
    expect(brandReadable("#808080")).toBe(false);
    expect(brandReadable("#E0457B")).toBe(false);
    expect(bandContrast("#808080")).toBeLessThan(READABLE);
  });

  it("offers the nearest shade that reads, and keeps a colour that already does", () => {
    expect(readableBrand("#0B3D91")).toBe("#0B3D91");
    for (const unreadable of ["#808080", "#E0457B", "#3BA55C"]) {
      const shade = readableBrand(unreadable);
      expect(shade).not.toBe(unreadable);
      expect(brandReadable(shade)).toBe(true);
      expect(contrast(faintBandText(shade), shade)).toBeGreaterThanOrEqual(
        READABLE,
      );
    }
  });

  it("paints the sign-in in the brand colour, else a lent colour made readable, else the platform's", () => {
    expect(portalColour("#6D28D9", "#0B3D91")).toBe("#6D28D9");
    expect(portalColour(null, "#0b3d91")).toBe("#0B3D91");
    expect(portalColour(null, "#808080")).toBe(readableBrand("#808080"));
    expect(portalColour(null, null)).toBeNull();
  });
});
