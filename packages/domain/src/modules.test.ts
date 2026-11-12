import { describe, expect, it } from "vitest";

import type { ModuleId } from "./modules";

import { MODULE_IDS, MODULES, modulesOn } from "./modules";

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

  it("turns the gradebook off with coursework, whatever the plan", () => {
    expect(onWithout(["coursework"]).gradebook).toBe(false);
    expect(onWithout(["school_years"]).gradebook).toBe(true);
  });
});
