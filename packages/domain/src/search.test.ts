import { describe, expect, it } from "vitest";

import { searchableKinds } from "./search";

describe("searchableKinds", () => {
  it("opens classes to a family through the student profile capability", () => {
    expect(searchableKinds(["student-profile:read", "messages:read"])).toEqual([
      "students",
      "classes",
      "people",
      "messages",
      "announcements",
    ]);
  });

  it("leaves people and announcements open without any capability", () => {
    expect(searchableKinds([])).toEqual(["people", "announcements"]);
  });
});
