import { describe, expect, it } from "vitest";

import { findSchools, portalAccent, searchKey } from "./portal-face";
import { contrast, THEMES } from "./site-theme";

const SCHOOLS = [
  {
    slug: "northwind",
    nameEn: "Northwind International College",
    nameAr: "كلية نورثويند الدولية",
    listed: true,
  },
  {
    slug: "northwind-east",
    nameEn: "Northwind East School",
    nameAr: "مدرسة نورثويند الشرقية",
    listed: true,
  },
  {
    slug: "acme",
    nameEn: "Acme Academy",
    nameAr: "أكاديمية أكمي",
    listed: true,
  },
  {
    slug: "quiet-hill",
    nameEn: "Quiet Hill School",
    nameAr: null,
    listed: false,
  },
];

const slugs = (query: string) =>
  findSchools(query, SCHOOLS).map((school) => school.slug);

describe("searchKey", () => {
  it("folds the Arabic letters people write interchangeably", () => {
    expect(searchKey("أكاديمية")).toBe(searchKey("اكاديميه"));
    expect(searchKey("إسلامى")).toBe(searchKey("اسلامي"));
    expect(searchKey("مَدْرَسَة")).toBe("مدرسه");
    expect(searchKey("مـدرسة")).toBe("مدرسه");
  });

  it("drops Latin accents, case and punctuation", () => {
    expect(searchKey("  École Saint-Joseph ")).toBe("ecole saint joseph");
  });

  it("reads Arabic digits as Latin ones", () => {
    expect(searchKey("مدرسة ٢٥")).toBe("مدرسه 25");
  });
});

describe("findSchools", () => {
  it("finds a school by the start of its name in either language", () => {
    expect(slugs("north")).toEqual(["northwind-east", "northwind"]);
    expect(slugs("كلية نورث")).toEqual(["northwind"]);
    expect(slugs("اكاديمية")).toEqual(["acme"]);
  });

  it("puts the school whose code was typed first", () => {
    expect(slugs("northwind")[0]).toBe("northwind");
  });

  it("matches each word typed, in any order", () => {
    expect(slugs("east northwind")).toEqual(["northwind-east"]);
    expect(slugs("الشرقية نورثويند")).toEqual(["northwind-east"]);
  });

  it("finds an unlisted school by its exact code only", () => {
    expect(slugs("quiet")).toEqual([]);
    expect(slugs("Quiet Hill School")).toEqual([]);
    expect(slugs("quiet-hill")).toEqual(["quiet-hill"]);
  });

  it("answers a single letter with nothing but an exact code", () => {
    expect(slugs("n")).toEqual([]);
  });

  it("answers with no more than the limit", () => {
    expect(findSchools("school", SCHOOLS, 1)).toHaveLength(1);
  });
});

describe("portalAccent", () => {
  const pages = {
    light: ["#FFFFFF", "#F6F5F3"],
    dark: ["#161718", "#1B1D1E"],
  } as const;

  for (const theme of Object.values(THEMES))
    it(`keeps ${theme.id}'s accent readable in both schemes`, () => {
      const accent = portalAccent(theme.palette.primary);
      for (const scheme of ["light", "dark"] as const) {
        const { primary, primaryForeground } = accent[scheme];
        for (const page of pages[scheme])
          expect(contrast(primary, page)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(primaryForeground, primary)).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    });

  it("keeps a brand colour that already reads as it is", () => {
    expect(portalAccent(THEMES.meridian.palette.primary).light.primary).toBe(
      "#0b3d91",
    );
  });

  it("lightens a dark brand colour for the dark scheme", () => {
    const { dark } = portalAccent(THEMES.meridian.palette.primary);
    expect(dark.primary).not.toBe("#0b3d91");
    expect(contrast(dark.primary, "#161718")).toBeGreaterThanOrEqual(4.5);
  });
});
