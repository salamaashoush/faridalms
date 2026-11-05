import { businessToday } from "@faridalms/domain/subscriptions";

import type { Publishing } from "./publication";
import type { Operator } from "./session";

import { requireBusiness } from "./business";
import { directoryAdmin } from "./directory-admin";
import { dailyRound, roundDue, SYSTEM_OPERATOR } from "./publication";
import { changeStanding, tellCell } from "./standing";

/** Who the scheduled round acts as, toward the cells and in the logs. */
const SYSTEM: Operator = {
  id: SYSTEM_OPERATOR,
  name: "Daily round",
  email: null,
  authAt: 0,
};

/** The round's dependencies, acting as the operator who runs it. */
export function publishing(operator: Operator): Publishing {
  return {
    business: requireBusiness(),
    directory: directoryAdmin(),
    entitlementsChanged: (tenantId) => tellCell(operator, tenantId),
    pauseTenant: async (tenantId, reason) =>
      (
        await changeStanding(operator, {
          tenantId,
          standing: "read_only",
          reason,
        })
      ).ok,
  };
}

/** Runs today's round as an operator who asked for it now. */
export const runRoundAs = (operator: Operator) =>
  dailyRound(publishing(operator), businessToday(), operator.id);

/** Runs today's round unless it has run, as the scheduler does each hour. */
export async function runRoundIfDue(): Promise<void> {
  const day = businessToday();
  if (!(await roundDue(requireBusiness(), day))) return;
  const outcome = await dailyRound(publishing(SYSTEM), day);
  if (outcome)
    console.info(JSON.stringify({ worker: "daily_round", ...outcome }));
}
