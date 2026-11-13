import type { ModuleId } from "@faridalms/domain/modules";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MODULE_FILLINGS } from "~/extensions";

import { modulePages, pageOn, pageOwnersOf } from "./pages";

const without = (...off: ModuleId[]) =>
  Object.fromEntries(MODULE_IDS.map((id) => [id, !off.includes(id)])) as Record<
    ModuleId,
    boolean
  >;

/** Every route the router knows, by its full path, as the generated tree lists them. */
const ROUTES = (() => {
  const tree = readFileSync(
    join(process.cwd(), "apps/web/src/routeTree.gen.ts"),
    "utf8",
  );
  const start = tree.indexOf("export interface FileRoutesByFullPath {");
  const body = tree.slice(start, tree.indexOf("}", start));
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? "");
})();

/** A route path as a page's path: its parameters filled with something. */
const pathOf = (route: string) =>
  route.replaceAll(/\$[A-Za-z]*/g, "x").replace(/\/$/, "") || "/";

const on = (path: string, ...off: ModuleId[]) =>
  pageOn(MODULE_FILLINGS, without(...off), path);

describe("the pages a school shows", () => {
  it("reads every route of the app", () => {
    expect(ROUTES.length).toBeGreaterThan(100);
  });

  it("knows every route as core's or one module's, never both", () => {
    const unclaimed: string[] = [];
    for (const route of ROUTES) {
      const owners = pageOwnersOf(MODULE_FILLINGS, pathOf(route));
      if (owners.core ? owners.modules.length > 0 : owners.modules.length !== 1)
        unclaimed.push(`${route}: ${JSON.stringify(owners)}`);
    }
    expect(unclaimed).toEqual([]);
  });

  it("answers every page a module declares as not there while the module is off", () => {
    const shown: string[] = [];
    for (const entry of MODULE_FILLINGS)
      for (const filling of entry.fillings)
        if (filling.slot === modulePages)
          for (const prefix of filling.value as readonly string[]) {
            for (const off of [entry.module, ...(entry.needs ?? [])]) {
              const elsewhere = MODULE_FILLINGS.some(
                (other) =>
                  other !== entry &&
                  other.module !== off &&
                  !(other.needs ?? []).includes(off) &&
                  other.fillings.some(
                    (each) =>
                      each.slot === modulePages &&
                      (each.value as readonly string[]).includes(prefix),
                  ),
              );
              if (!elsewhere && pageOn(MODULE_FILLINGS, without(off), prefix))
                shown.push(`${prefix} with ${off} off`);
            }
          }
    expect(shown).toEqual([]);
  });

  it("shows every page with every module on", () => {
    const hidden = ROUTES.map(pathOf).filter(
      (path) => !pageOn(MODULE_FILLINGS, without(), path),
    );
    expect(hidden).toEqual([]);
  });

  it("shows the year map only where e-learning and school years are both on", () => {
    expect(pageOn(MODULE_FILLINGS, without(), "/year-map")).toBe(true);
    expect(pageOn(MODULE_FILLINGS, without("school_years"), "/year-map")).toBe(
      false,
    );
    expect(pageOn(MODULE_FILLINGS, without("elearning"), "/year-map")).toBe(
      false,
    );
    expect(pageOn(MODULE_FILLINGS, without("school_years"), "/modules")).toBe(
      true,
    );
  });

  it("shows a student's grades wherever the gradebook keeps running grades, and a family's only with families", () => {
    expect(on("/me/grades")).toBe(true);
    expect(on("/me/grades", "school_years")).toBe(true);
    expect(on("/family/grades", "standards")).toBe(true);
    expect(on("/me/grades", "school_years", "standards")).toBe(true);
    expect(on("/family/grades", "school_years", "standards")).toBe(true);
    expect(on("/me/grades", "gradebook")).toBe(false);
    expect(on("/family/grades", "families")).toBe(false);
  });

  it("keeps a family's view of a module to schools with families and the module", () => {
    expect(on("/family/attendance")).toBe(true);
    expect(on("/family/attendance", "attendance")).toBe(false);
    expect(on("/family/attendance", "families")).toBe(false);
    expect(on("/classes", ...MODULE_IDS)).toBe(true);
  });
});
