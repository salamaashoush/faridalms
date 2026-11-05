import { businessToday } from "@faridalms/domain/subscriptions";

import type { Publishing } from "./publication";
import type { Operator } from "./session";

import { requireBusiness } from "./business";
import { dailyRound, roundDue } from "./daily-round";
import { directoryAdmin } from "./directory-admin";
import { settleClock } from "./dunning";
import { consoleMail } from "./mail";
import { explain, tenantCalendar } from "./provisioner";
import { SYSTEM_OPERATOR } from "./publication";
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
    setStanding: async (tenantId, standing, reason) =>
      (await changeStanding(operator, { tenantId, standing, reason })).ok,
    calendar: async (tenantId) => {
      const answer = await tenantCalendar(operator, { tenantId });
      if (answer.ok) return answer.value.schools;
      console.error(
        JSON.stringify({
          worker: "tenant_calendar",
          tenantId,
          error: explain(answer),
        }),
      );
      return null;
    },
    mail: consoleMail(),
    now: () => new Date(),
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

/**
 * Gives back what the clock took from a customer's school once money is
 * received or credited. A failure is logged and does not undo the payment:
 * the next round tries again.
 */
export async function settleClockAs(
  operator: Operator,
  customerId: string,
): Promise<void> {
  try {
    const out = await settleClock(publishing(operator), {
      customerId,
      day: businessToday(),
      by: operator.id,
    });
    if (out.failed.length > 0)
      console.error(
        JSON.stringify({
          worker: "settle_clock",
          customerId,
          failed: out.failed,
        }),
      );
  } catch (error) {
    console.error(
      JSON.stringify({
        worker: "settle_clock",
        customerId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
