import { MODULE_IDS } from "@faridalms/domain/modules";
import { ONBOARDING_ITEMS } from "@faridalms/domain/onboarding";
import { describe, expect, test } from "bun:test";

import { MODULE_GROUPS, ONBOARDING_PHASES } from "../src/format";

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
