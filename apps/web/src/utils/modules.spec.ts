import type { ModuleId } from "@faridalms/domain/modules";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { describe, expect, it } from "vitest";

import { moduleOfPath, pageOn } from "./modules";

const without = (...off: ModuleId[]) =>
  Object.fromEntries(MODULE_IDS.map((id) => [id, !off.includes(id)])) as Record<
    ModuleId,
    boolean
  >;

describe("the pages a school shows", () => {
  it("shows the year map only where e-learning and school years are both on", () => {
    expect(moduleOfPath("/year-map")).toBe("elearning");
    expect(pageOn(without(), "/year-map")).toBe(true);
    expect(pageOn(without("school_years"), "/year-map")).toBe(false);
    expect(pageOn(without("elearning"), "/year-map")).toBe(false);
    expect(pageOn(without("school_years"), "/modules")).toBe(true);
  });

  it("shows the curriculum map only where e-learning keeps the unit plans it reads", () => {
    expect(pageOn(without(), "/standards/map")).toBe(true);
    expect(pageOn(without("elearning"), "/standards/map")).toBe(false);
    expect(pageOn(without("elearning"), "/standards")).toBe(true);
  });

  it("shows a student's grades where term grades or skills fill them, and nowhere else", () => {
    expect(pageOn(without(), "/me/grades")).toBe(true);
    expect(pageOn(without("school_years"), "/me/grades")).toBe(true);
    expect(pageOn(without("standards"), "/family/grades")).toBe(true);
    expect(pageOn(without("school_years", "standards"), "/me/grades")).toBe(
      false,
    );
    expect(pageOn(without("school_years", "standards"), "/family/grades")).toBe(
      false,
    );
    expect(pageOn(without("gradebook"), "/me/grades")).toBe(false);
  });
});
