import { describe, expect, it } from "vitest";

import type { ModuleId } from "./modules";

import { MODULE_IDS, MODULES, modulesOfSystem, modulesOn } from "./modules";

const onWithout = (off: readonly ModuleId[]) =>
  modulesOn({
    entitled: (id) => !off.includes(id),
    switchedOn: () => true,
  });

describe("modules", () => {
  it("names in each requirement only modules settled before it, so one pass settles every module", () => {
    for (const [index, id] of MODULE_IDS.entries())
      for (const group of MODULES[id].requires)
        for (const need of group)
          expect(
            MODULE_IDS.indexOf(need),
            `${id} requires ${need}`,
          ).toBeLessThan(index);
  });

  it("keeps standards on with either coursework or e-learning, and off without both", () => {
    expect(onWithout(["coursework"]).standards).toBe(true);
    expect(onWithout(["elearning"]).standards).toBe(true);
    expect(onWithout(["coursework", "elearning"]).standards).toBe(false);
  });

  it("turns badges off without grade levels, which alone mark a child as young", () => {
    expect(onWithout([]).badges).toBe(true);
    expect(onWithout(["grade_levels"]).badges).toBe(false);
  });

  it("answers the grade levels namespace only for the grade levels module", () => {
    expect(MODULES.grade_levels.systems).toEqual(["gradeLevels"]);
    expect(MODULES.grade_levels.requires).toEqual([]);
  });

  it("turns the gradebook off with coursework, whatever the plan", () => {
    expect(onWithout(["coursework"]).gradebook).toBe(false);
    expect(onWithout(["school_years"]).gradebook).toBe(true);
  });
});

describe("namespaces that link two modules", () => {
  it("answer only where their owner and what they need are on", () => {
    expect(modulesOfSystem("guardians")).toEqual(["families"]);
    expect(modulesOfSystem("followUp")).toEqual(["attendance"]);
    expect(modulesOfSystem("familyShares")).toEqual(["coursework", "families"]);
    expect(modulesOfSystem("people")).toEqual([]);
  });
});
