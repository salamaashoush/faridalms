import { describe, expect, it } from "vitest";

import { familyRoleFor } from "./family-roles";

const portal = { portalAccess: true, legalGuardian: null };

describe("familyRoleFor", () => {
  it("makes mothers and fathers parents and guardians guardians", () => {
    expect(familyRoleFor("mother", portal)).toBe("parent");
    expect(familyRoleFor("father", portal)).toBe("parent");
    expect(familyRoleFor("guardian", portal)).toBe("guardian");
    expect(familyRoleFor("unspecified", portal)).toBe("guardian");
  });

  it("makes other family relatives", () => {
    for (const meaning of [
      "step_parent",
      "grandparent",
      "sibling",
      "other_relative",
    ])
      expect(familyRoleFor(meaning, portal)).toBe("relative");
  });

  it("gives no role without portal access or legal guardianship", () => {
    expect(
      familyRoleFor("mother", { portalAccess: false, legalGuardian: null }),
    ).toBeNull();
    expect(
      familyRoleFor("father", { portalAccess: false, legalGuardian: true }),
    ).toBe("parent");
  });

  it("lets a non-relative in only as a school-designated adult with portal access", () => {
    expect(familyRoleFor("non_relative", portal)).toBeNull();
    expect(
      familyRoleFor("non_relative", {
        ...portal,
        accessBasis: "school_designated",
      }),
    ).toBe("relative");
  });
});
