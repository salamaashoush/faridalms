import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ModuleId } from "./modules";

import { MODULE_IDS, MODULES } from "./modules";
import { cardModules, offeredModules, setOfferSchema } from "./plans";

const off = (module: string) => ({ module, offered: false });
const on = (module: string) => ({ module, offered: true });

describe("the modules on offer", () => {
  it("takes each module's declared default where the operator has not decided", () => {
    const offered = offeredModules([]);
    expect(offered).not.toContain("sso");
    expect(offered).toContain("sms");
    expect(offered).toEqual(MODULE_IDS.filter((id) => MODULES[id].offered));
  });

  it("only single sign-on, with no sign-in flow yet, is declared off offer", () => {
    expect(MODULE_IDS.filter((id) => !MODULES[id].offered)).toEqual(["sso"]);
  });

  it("lets the operator's decision override the default either way", () => {
    const offered = offeredModules([on("sso"), off("sms")]);
    expect(offered).toContain("sso");
    expect(offered).not.toContain("sms");
    expect(offered).toHaveLength(MODULE_IDS.length - 1);
  });

  it("ignores a decision about an id the product no longer has", () => {
    expect(offeredModules([on("telepathy")])).toEqual(offeredModules([]));
  });
});

describe("a school's plan card", () => {
  const held = new Set<ModuleId>(["coursework", "attendance", "sso"]);
  const listed = cardModules({
    modules: ["coursework", "attendance", "coding", "sso", "sms"],
    has: (module) => held.has(module),
    offered: offeredModules([off("sms")]),
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
