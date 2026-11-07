/**
 * What an operator of the console does. Every operator is an owner where
 * the console runs without its business database.
 */
export const OPERATOR_ROLES = ["owner", "sales", "support", "finance"] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

/**
 * What each part of the console needs. An owner holds every role's rights;
 * reading a tenant's state is open to every role.
 */
export const OPERATOR_AREAS = {
  tenants: ["owner", "support"],
  readTenants: ["owner", "sales", "support", "finance"],
  entitlements: ["owner", "support"],
  lifecycle: ["owner"],
  leads: ["owner", "sales"],
  customers: ["owner", "sales", "finance"],
  catalogue: ["owner"],
  subscriptions: ["owner", "sales"],
  readSubscriptions: ["owner", "sales", "support", "finance"],
  billing: ["owner", "finance"],
  readBilling: ["owner", "support", "finance"],
  support: ["owner", "support"],
  notices: ["owner", "support"],
  reports: ["owner", "finance"],
  operators: ["owner"],
  settings: ["owner"],
} as const satisfies Record<string, readonly OperatorRole[]>;
export type OperatorArea = keyof typeof OPERATOR_AREAS;

export function mayOperate(
  roles: readonly OperatorRole[],
  area: OperatorArea,
): boolean {
  const allowed: readonly OperatorRole[] = OPERATOR_AREAS[area];
  return roles.some((role) => allowed.includes(role));
}

/**
 * How recent a sign-in must be for an action that asks for one: stopping a
 * school, changing what it may use at once, crediting money or opening a
 * school's data to support.
 */
export const STEP_UP_MINUTES = 5;

/**
 * How long an operator with a role may go without signing in before an
 * owner is asked whether they still need access.
 */
export const QUIET_DAYS = 90;
