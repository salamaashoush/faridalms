import { MODULE_IDS } from "@faridalms/domain/modules";
import { ONBOARDING_ITEMS } from "@faridalms/domain/onboarding";
import { describe, expect, test } from "bun:test";

import { formatAmount, MODULE_GROUPS, ONBOARDING_PHASES } from "../src/format";

describe("the console's module groups", () => {
  test("hold every module once, so none goes unlisted on a school", () => {
    const listed = MODULE_GROUPS.flatMap((group) => group.modules);
    expect(listed.toSorted()).toEqual([...MODULE_IDS].toSorted());
  });
});

describe("the console's onboarding phases", () => {
  test("hold every step once", () => {
    const listed = ONBOARDING_PHASES.flatMap((phase) => phase.items);
    expect(listed.toSorted()).toEqual([...ONBOARDING_ITEMS].toSorted());
  });
});

describe("an amount without its currency", () => {
  test("keeps the currency's decimals and groups thousands", () => {
    expect(formatAmount(34_314_000, "EGP")).toBe("343,140.00");
    expect(formatAmount(1_080_000, "USD")).toBe("10,800.00");
    expect(formatAmount(0, "EGP")).toBe("0.00");
  });
});
