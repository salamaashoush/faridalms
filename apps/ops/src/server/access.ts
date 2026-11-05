import type { OperatorArea, OperatorRole } from "@faridalms/domain/operators";

import { operatorById } from "@faridalms/database/business/operators";
import { mayOperate, STEP_UP_MINUTES } from "@faridalms/domain/operators";

import type { Operator } from "./session";

import { businessDb } from "./business";
import { currentOperator, requireOperator } from "./session";

export interface OperatorAccess {
  operator: Operator;
  roles: OperatorRole[];
  /** The console has its business database: customers, billing, roles. */
  business: boolean;
}

/**
 * What the signed-in operator may do, read fresh on each call so a role
 * given or taken away applies at once. Without a business database every
 * operator is an owner, as the self-hosted console has always been.
 */
async function accessOf(operator: Operator): Promise<OperatorAccess> {
  const db = businessDb();
  if (!db) return { operator, roles: ["owner"], business: false };
  const row = await operatorById(db, operator.id);
  return {
    operator,
    roles: row && row.state === "active" ? row.roles : [],
    business: true,
  };
}

export async function currentAccess(): Promise<OperatorAccess | null> {
  const operator = currentOperator();
  return operator ? accessOf(operator) : null;
}

/** The operator, if their roles cover this part of the console. */
export async function requireArea(area: OperatorArea): Promise<OperatorAccess> {
  const access = await accessOf(requireOperator());
  if (!mayOperate(access.roles, area)) throw new Error("FORBIDDEN");
  return access;
}

/**
 * Refuses an action that stops a school, changes what it may use at once,
 * credits money or opens its data, unless the operator signed in within
 * the last few minutes; the console then sends them to sign in again.
 */
export function requireFreshSignIn(operator: Operator) {
  if (Date.now() / 1000 - operator.authAt > STEP_UP_MINUTES * 60)
    throw new Error("STEP_UP");
}
