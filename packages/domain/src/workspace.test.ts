import { describe, expect, test } from "vitest";

import { namingRole } from "./workspace";

describe("the role that names a session", () => {
  test("is the one that belongs to the workspace, of all a person holds", () => {
    const roles = ["parent", "teacher", "staff"];
    expect(namingRole(roles, "staff")).toBe("teacher");
    expect(namingRole(roles, "family")).toBe("parent");
    expect(namingRole(roles, "me")).toBeNull();
  });

  test("puts running the school before teaching in it", () => {
    expect(namingRole(["teacher", "principal"], "staff")).toBe("principal");
    expect(namingRole(["staff"], "staff")).toBe("staff");
  });

  test("calls someone who has only applied an applicant", () => {
    expect(namingRole(["applicant_family"], "family")).toBe("applicant_family");
    expect(namingRole(["applicant"], "me")).toBe("applicant");
    expect(namingRole(["applicant_family", "guardian"], "family")).toBe(
      "guardian",
    );
    expect(namingRole(["applicant", "student"], "me")).toBe("student");
  });
});
