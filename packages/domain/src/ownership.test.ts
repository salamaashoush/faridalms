import { describe, expect, it } from "vitest";

import { MODULES } from "./modules";
import { guaranteedBy, mayReach } from "./ownership";

const modules = {
  base: { requires: [] },
  marks: { requires: [["base"]] },
  reports: { requires: [["marks"]] },
  lessons: { requires: [] },
  either: { requires: [["marks"], ["lessons"]] },
  both: { requires: [["marks", "lessons"]] },
  shared: { requires: [["marks", "lessons"], ["marks"]] },
  apart: { requires: [] },
} as const;

describe("guaranteedBy", () => {
  it("follows requirements through every module they name", () => {
    expect([...guaranteedBy("reports", modules)].toSorted()).toEqual([
      "base",
      "marks",
    ]);
  });

  it("keeps only what every alternative brings", () => {
    expect([...guaranteedBy("either", modules)]).toEqual([]);
    expect([...guaranteedBy("shared", modules)].toSorted()).toEqual([
      "base",
      "marks",
    ]);
  });

  it("brings every module of a group required in full", () => {
    expect([...guaranteedBy("both", modules)].toSorted()).toEqual([
      "base",
      "lessons",
      "marks",
    ]);
  });
});

describe("mayReach", () => {
  it("lets every table reach core", () => {
    expect(mayReach({ owner: "core" }, "core", modules)).toBe(true);
    expect(mayReach({ owner: "apart" }, "core", modules)).toBe(true);
  });

  it("keeps a core table to core", () => {
    expect(mayReach({ owner: "core" }, "base", modules)).toBe(false);
  });

  it("lets a module reach itself and what it requires, transitively", () => {
    expect(mayReach({ owner: "reports" }, "reports", modules)).toBe(true);
    expect(mayReach({ owner: "reports" }, "marks", modules)).toBe(true);
    expect(mayReach({ owner: "reports" }, "base", modules)).toBe(true);
  });

  it("keeps a module from what it does not require", () => {
    expect(mayReach({ owner: "marks" }, "reports", modules)).toBe(false);
    expect(mayReach({ owner: "marks" }, "lessons", modules)).toBe(false);
  });

  it("refuses a module only one alternative requires", () => {
    expect(mayReach({ owner: "either" }, "marks", modules)).toBe(false);
    expect(mayReach({ owner: "either" }, "lessons", modules)).toBe(false);
  });

  it("lets a link table reach what it needs and what that requires", () => {
    const link = { owner: "lessons", needs: ["reports"] } as const;
    expect(mayReach(link, "reports", modules)).toBe(true);
    expect(mayReach(link, "base", modules)).toBe(true);
    expect(mayReach(link, "apart", modules)).toBe(false);
  });

  it("reads the product's own requirements", () => {
    expect(mayReach({ owner: "peer_review" }, "coursework", MODULES)).toBe(
      true,
    );
    expect(mayReach({ owner: "standards" }, "coursework", MODULES)).toBe(false);
    expect(mayReach({ owner: "early_years" }, "elearning", MODULES)).toBe(true);
    expect(
      mayReach(
        { owner: "attendance", needs: ["timetable"] },
        "timetable",
        MODULES,
      ),
    ).toBe(true);
  });
});
