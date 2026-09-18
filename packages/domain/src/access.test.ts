import { describe, expect, it } from "vitest";

import { grantable, roleFitsBase, withdrawn } from "./access";

describe("grantable", () => {
  it("allows only what the actor already holds", () => {
    const outcome = grantable(
      ["classes:read", "attendance:read", "access:manage"],
      ["classes:read", "school:manage", "attendance:read"],
    );
    expect(outcome.allowed).toEqual(["classes:read", "attendance:read"]);
    expect(outcome.refused).toEqual(["school:manage"]);
  });

  it("refuses nothing when the request is within the actor's grant", () => {
    expect(grantable(["classes:read"], ["classes:read"]).refused).toEqual([]);
  });
});

describe("withdrawn", () => {
  it("lists permissions a change removes and ignores additions", () => {
    expect(
      withdrawn(
        ["classes:read", "attendance:read"],
        ["classes:read", "timetable:read"],
      ),
    ).toEqual(["attendance:read"]);
  });
});

describe("roleFitsBase", () => {
  it("only matches an account of the same base role", () => {
    expect(roleFitsBase("teacher", "teacher")).toBe(true);
    expect(roleFitsBase("teacher", "parent")).toBe(false);
  });
});
