import { describe, expect, it } from "vitest";

import { audienceRoles, retryDelayMs } from "./notification";

describe("retryDelayMs", () => {
  it("backs off and stops after the last allowed attempt", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(5 * 60_000);
    expect(retryDelayMs(4)).toBe(2 * 3_600_000);
    expect(retryDelayMs(5)).toBeNull();
    expect(retryDelayMs(9)).toBeNull();
  });

  it("scales with the configured base", () => {
    expect(retryDelayMs(1, 1000)).toBe(1000);
    expect(retryDelayMs(3, 1000)).toBe(30_000);
  });
});

describe("audienceRoles", () => {
  it("maps an audience to the roles it reaches", () => {
    expect(audienceRoles("parents")).toEqual(["parent"]);
    expect(audienceRoles("everyone")).toHaveLength(4);
  });
});
