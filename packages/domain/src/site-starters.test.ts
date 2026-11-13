import { describe, expect, it } from "vitest";

import type { SchoolPage } from "./site-starters";

import { MODULE_IDS } from "./modules";
import { reviewStarter, starterWork } from "./site-starters";
import { buildStarter, siteModules, STARTERS } from "./site-templates";

const EVERY = siteModules(MODULE_IDS);
const WITHOUT_FAMILIES = siteModules(
  MODULE_IDS.filter((module) => module !== "families"),
);

const SCHOOL: SchoolPage[] = [
  { id: "p-home", slug: "welcome", isHome: true },
  { id: "p-about", slug: "about", isHome: false },
  { id: "p-visit", slug: "visit", isHome: false },
];

describe("a starter's pages at a school", () => {
  it("are new, meet the school's page at their address, or are left out for a module it lacks", () => {
    const review = reviewStarter(
      STARTERS.international,
      WITHOUT_FAMILIES,
      SCHOOL,
    );
    expect(
      review.map((row) => [row.page.slug, row.fate, row.pageId, row.missing]),
    ).toEqual([
      ["home", "taken", "p-home", []],
      ["about", "taken", "p-about", []],
      ["academics", "new", null, []],
      ["admissions", "new", null, []],
      ["visit", "taken", "p-visit", []],
      ["parents", "without", null, ["families"]],
      ["contact", "new", null, []],
    ]);
  });

  it("are made where new, replace only the pages chosen, and keep every other", () => {
    const built = buildStarter(STARTERS.international, "en", EVERY);
    const work = starterWork(built, SCHOOL, ["about"]);
    expect(work.create.map((page) => page.plan.slug)).toEqual([
      "academics",
      "admissions",
      "parents",
      "contact",
    ]);
    expect(
      work.replace.map((entry) => [entry.pageId, entry.planned.plan.slug]),
    ).toEqual([["p-about", "about"]]);
    expect(work.replace[0]?.planned.built.content.length).toBeGreaterThan(0);
    expect(work.refused).toEqual([]);

    const kept = starterWork(built, SCHOOL, []);
    expect(kept.replace).toEqual([]);
    expect(kept.create.map((page) => page.plan.slug)).toEqual(
      work.create.map((page) => page.plan.slug),
    );
  });

  it("replace the school's home page whatever its address", () => {
    const built = buildStarter(STARTERS.heritage, "ar", EVERY);
    const work = starterWork(built, SCHOOL, ["home"]);
    expect(work.replace.map((entry) => entry.pageId)).toEqual(["p-home"]);
    expect(work.create.map((page) => page.plan.slug)).not.toContain("home");
  });

  it("refuse to replace a page the starter does not build there, or the school does not have", () => {
    const built = buildStarter(STARTERS.international, "en", WITHOUT_FAMILIES);
    const parents: SchoolPage = {
      id: "p-parents",
      slug: "parents",
      isHome: false,
    };
    const work = starterWork(
      built,
      [...SCHOOL, parents],
      ["parents", "contact", "about"],
    );
    expect(work.refused).toEqual(["parents", "contact"]);
    expect(work.replace.map((entry) => entry.pageId)).toEqual(["p-about"]);
  });
});
