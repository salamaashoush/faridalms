// Who can be signed in, and what each of them is allowed to see.
//
// Roles are closed sets rather than free strings so a typo is a type error, and
// so every guard in the app checks against the same vocabulary.

export const ROLES = ["admin", "teacher", "parent", "student"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Capabilities, not screens. Routes and buttons ask "may I?" rather than
 * "which role is this?", so adding a role later does not mean auditing every
 * `role === "admin"` in the tree.
 */
export const PERMISSIONS = [
  // school administration
  "access:manage",
  "school:manage",
  "users:read",
  "users:manage",
  "classes:read",
  "classes:manage",
  "calendar:manage",
  "announcements:manage",
  "site:manage",
  "reports:read",
  "years:reopen",

  // teaching
  "roster:read",
  "assignments:author",
  "assignments:read",
  "submissions:grade",
  "attendance:record",

  // learning and family
  "student-profile:read",
  "student-contacts:read",
  "student-medical:read",
  "children:read",
  "own-work:read",
  "own-work:submit",
  "grades:read",
  "attendance:read",
  "timetable:read",
  "messages:read",
  "messages:send",
  "newsletters:read",
  "calendar:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const EVERYONE: Permission[] = [
  "assignments:read",
  "student-profile:read",
  "messages:read",
  "messages:send",
  "newsletters:read",
  "calendar:read",
  "timetable:read",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [...PERMISSIONS],
  teacher: [
    ...EVERYONE,
    "student-contacts:read",
    "classes:read",
    "roster:read",
    "assignments:author",
    "submissions:grade",
    "attendance:record",
    "attendance:read",
    "grades:read",
    "reports:read",
  ],
  parent: [
    ...EVERYONE,
    "student-contacts:read",
    "student-medical:read",
    "children:read",
    "grades:read",
    "attendance:read",
  ],
  student: [
    ...EVERYONE,
    "student-contacts:read",
    "student-medical:read",
    "own-work:read",
    "own-work:submit",
    "grades:read",
    "attendance:read",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAll(role: Role, permissions: Permission[]): boolean {
  return permissions.every((permission) => can(role, permission));
}

export function canAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}

/** The landing route for each role, used after sign-in and by the logo link. */
export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  teacher: "/teach",
  parent: "/family",
  student: "/me",
};
