import type { Permission, Role } from "@faridalms/domain/identity";

import {
  can,
  canAll,
  canAny,
  PERMISSIONS,
  ROLE_HOME,
  ROLE_PERMISSIONS,
  ROLES,
} from "@faridalms/domain/identity";
import { describe, expect, it } from "vitest";

describe("role permissions", () => {
  it("gives an administrator every capability", () => {
    expect(ROLE_PERMISSIONS.admin).toHaveLength(PERMISSIONS.length);
    for (const permission of PERMISSIONS) {
      expect(can("admin", permission)).toBe(true);
    }
  });

  it.each([
    ["teacher", "school:manage"],
    ["teacher", "users:manage"],
    ["parent", "submissions:grade"],
    ["parent", "attendance:record"],
    ["parent", "own-work:submit"],
    ["student", "children:read"],
    ["student", "roster:read"],
    ["student", "assignments:author"],
  ] satisfies [Role, Permission][])(
    "denies %s the %s capability",
    (role, permission) => {
      expect(can(role, permission)).toBe(false);
    },
  );

  it("lets a student submit only their own work", () => {
    expect(can("student", "own-work:submit")).toBe(true);
    expect(can("parent", "own-work:submit")).toBe(false);
  });

  it("gives every role the shared communication capabilities", () => {
    for (const role of ROLES) {
      expect(
        canAll(role, [
          "messages:read",
          "messages:send",
          "calendar:read",
          "timetable:read",
        ]),
      ).toBe(true);
    }
  });

  it("grants no role a capability outside the declared list", () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  it("lands every role somewhere", () => {
    for (const role of ROLES) {
      expect(ROLE_HOME[role]).toMatch(/^\/[a-z]+$/);
    }
    // Two roles sharing a landing route would make the redirect ambiguous.
    expect(new Set(Object.values(ROLE_HOME)).size).toBe(ROLES.length);
  });

  it("canAny is satisfied by a single held capability", () => {
    expect(canAny("parent", ["school:manage", "children:read"])).toBe(true);
    expect(canAny("parent", ["school:manage", "users:manage"])).toBe(false);
  });
});
