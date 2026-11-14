import type { Profile } from "./capabilities";

/**
 * The route area a profile works in, one per session context. Each area
 * gates its own routes; inside the staff area capabilities decide each page,
 * and the server still authorises every read by capability and relationship.
 */
export const WORKSPACES = ["staff", "family", "me"] as const;
export type Workspace = (typeof WORKSPACES)[number];

export const WORKSPACE_OF: Record<Profile, Workspace> = {
  staff_admin: "staff",
  staff: "staff",
  family: "family",
  student: "me",
  young_student: "me",
};

export const WORKSPACE_HOME: Record<Workspace, string> = {
  staff: "/today",
  family: "/family",
  me: "/me",
};

export type SessionContext = "staff" | "family" | "student";

export const STAFF_ROLES = [
  "teacher",
  "aide",
  "counselor",
  "principal",
  "site_administrator",
  "district_administrator",
  "system_administrator",
  "proctor",
  "staff",
] as const;

export const ADMINISTRATION_ROLES = [
  "principal",
  "site_administrator",
  "district_administrator",
  "system_administrator",
] as const;

export const FAMILY_ROLES = ["parent", "guardian", "relative"] as const;

/**
 * The natural role of someone applying for another person, from registering
 * until the applicant is enrolled: it opens the family context where the
 * school keeps families.
 */
export const APPLICANT_ROLE = "applicant_family";

/**
 * The natural role of someone applying for themself, from registering until
 * they are enrolled: it opens their own context where the school takes
 * applications.
 */
export const SELF_APPLICANT_ROLE = "applicant";

/**
 * The contexts a person's natural roles open by themselves: staff roles the
 * staff context and the student role the student's. A module opens any
 * other, such as a family's, through `contextOpeners`.
 */
export function contextsFor(roles: readonly string[]): SessionContext[] {
  const contexts: SessionContext[] = [];
  if (roles.some((role) => (STAFF_ROLES as readonly string[]).includes(role)))
    contexts.push("staff");
  if (roles.includes("student")) contexts.push("student");
  return contexts;
}

/** Staff roles, the one that names a person's work first. */
const STAFF_BY_STANDING = [
  "principal",
  "site_administrator",
  "district_administrator",
  "system_administrator",
  "teacher",
  "counselor",
  "aide",
  "proctor",
  "staff",
] as const satisfies readonly (typeof STAFF_ROLES)[number][];

const NAMING: Record<Workspace, readonly string[]> = {
  staff: STAFF_BY_STANDING,
  family: [...FAMILY_ROLES, APPLICANT_ROLE],
  me: ["student", SELF_APPLICANT_ROLE],
};

/**
 * The natural role that says who a person is in a workspace, of all they
 * hold: a teacher who is also a parent is a teacher at work and a parent at
 * home, and someone who has only applied is an applicant in either.
 */
export function namingRole(
  roles: readonly string[],
  workspace: Workspace,
): string | null {
  return NAMING[workspace].find((role) => roles.includes(role)) ?? null;
}

/** The built-in access role that a natural role receives. */
export function builtinFor(role: string): string {
  return (FAMILY_ROLES as readonly string[]).includes(role) ? "family" : role;
}
