import { describe, expect, it } from "vitest";

import { fullName, roleStatus } from "./people";
import { toE164 } from "./phone";

describe("roleStatus", () => {
  const role = { from: "2026-09-13", to: null };

  it("reads a student role that holds today as enrolled", () => {
    expect(roleStatus([role], "2026-10-01")).toBe("enrolled");
  });

  it("reads a role that begins later as pre-enrolled", () => {
    expect(roleStatus([role], "2026-09-01")).toBe("pre_enrolled");
  });

  it("reads a role that has ended as left, whatever year it was", () => {
    expect(roleStatus([{ ...role, to: "2026-10-12" }], "2026-10-12")).toBe(
      "left",
    );
  });

  it("has nothing to say of someone who never held one", () => {
    expect(roleStatus([], "2026-10-01")).toBeNull();
  });
});

describe("fullName", () => {
  it("joins the parts that are present", () => {
    expect(fullName({ given: "Omar", middle: null, family: "Nasser" })).toBe(
      "Omar Nasser",
    );
    expect(fullName({ given: null, middle: null, family: null })).toBeNull();
  });
});

describe("toE164", () => {
  it("reads a national number in the school's country", () => {
    expect(toE164("0100 000 0003", "EG")).toBe("+201000000003");
    expect(toE164("050 123 4567", "AE")).toBe("+971501234567");
  });

  it("keeps an international number whatever the country", () => {
    expect(toE164("+20 (0)100 000 0003", "AE")).toBe("+201000000003");
    expect(toE164("0020 100 000 0003", "SA")).toBe("+201000000003");
  });

  it("refuses what cannot be a number", () => {
    expect(toE164("call me", "EG")).toBeNull();
    expect(toE164("12", "EG")).toBeNull();
  });
});
