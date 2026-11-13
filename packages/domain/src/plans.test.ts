import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ModuleId } from "./modules";

import { MODULE_IDS } from "./modules";
import { cardModules, offeredModules, setOfferSchema } from "./plans";

describe("the modules on offer", () => {
  it("offers every module the operator has not taken off", () => {
    expect(offeredModules([])).toEqual([...MODULE_IDS]);
    const offered = offeredModules(["sso", "sms"]);
    expect(offered).not.toContain("sso");
    expect(offered).not.toContain("sms");
    expect(offered).toHaveLength(MODULE_IDS.length - 2);
  });

  it("ignores a withheld id the product no longer has", () => {
    expect(offeredModules(["telepathy"])).toEqual([...MODULE_IDS]);
  });
});

describe("a school's plan card", () => {
  const held = new Set<ModuleId>(["coursework", "attendance", "sso"]);
  const listed = cardModules({
    modules: ["coursework", "attendance", "coding", "sso", "sms"],
    has: (module) => held.has(module),
    offered: offeredModules(["sso", "sms"]),
  });

  it("lists a module the school has, on offer or not", () => {
    expect(listed).toContain("coursework");
    expect(listed).toContain("sso");
  });

  it("lists a module it lacks only while it is on offer", () => {
    expect(listed).toContain("coding");
    expect(listed).not.toContain("sms");
  });

  it("keeps the order it was given", () => {
    expect(listed).toEqual(["coursework", "attendance", "coding", "sso"]);
  });
});

describe("setting the offer", () => {
  it("asks for a module, whether it is offered and why", () => {
    expect(
      v.safeParse(setOfferSchema, {
        module: "sso",
        offered: false,
        reason: "No provider sign-in yet",
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(setOfferSchema, { module: "sso", offered: true, reason: " " })
        .success,
    ).toBe(false);
    expect(
      v.safeParse(setOfferSchema, {
        module: "telepathy",
        offered: true,
        reason: "Why not",
      }).success,
    ).toBe(false);
  });
});
