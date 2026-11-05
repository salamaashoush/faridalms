import type { OperatorSchool } from "@faridalms/database/directory/admin";
import type { Language } from "@faridalms/documents/parts";
import type { DunningStep } from "@faridalms/domain/dunning";
import type { SchoolStanding } from "@faridalms/domain/provisioning";

import { customerById } from "@faridalms/database/business/customers";
import {
  dunningStandingOf,
  heldStandings,
  owedInvoices,
  pausesOf,
  setDunningStanding,
  stepsOf,
  takeStep,
} from "@faridalms/database/business/dunning";
import { profile } from "@faridalms/database/business/profile";
import {
  openSubscriptions,
  setNotice,
} from "@faridalms/database/business/subscriptions";
import { addTask } from "@faridalms/database/business/tasks";
import {
  clockDays,
  dunningStep,
  NOTICE_OF,
  severer,
  showsOverdue,
  standingAt,
  STEP_DAY,
  STEP_STANDING,
  weekendNow,
} from "@faridalms/domain/dunning";
import { standingOf } from "@faridalms/domain/provisioning";
import { addDays } from "@faridalms/domain/school";

import type { Publishing } from "./publication";

import { dunningEmail } from "./dunning-mail";
import { publishSubscription } from "./publication";

export interface DunningOutcome {
  /** Emails sent to billing contacts. */
  reminded: number;
  /** Tenants whose access the clock changed. */
  changed: number;
  /** What could not be sent or changed, to look at; the next round tries again. */
  failed: string[];
}

type Owed = Awaited<ReturnType<typeof owedInvoices>>[number];

interface Review {
  /** Whether access may be taken away: only the round does, at a weekend. */
  escalate: boolean;
  /** Whether the step's emails are sent and its tasks made. */
  remind: boolean;
}

const STANDING_STEP: Record<Exclude<SchoolStanding, "full">, DunningStep> = {
  restricted: "restricted",
  read_only: "read_only",
  suspended: "suspended",
};

const currentStanding = (schools: readonly OperatorSchool[]) => {
  const [first] = schools;
  return first
    ? standingOf(first.tenantState, first.entitlements.access)
    : null;
};

/**
 * Takes one customer's clock forward: emails each invoice's new step to
 * the billing contacts and asks the account owner to call, shows or takes
 * down the overdue notice, and moves the tenant's access to what its most
 * overdue invoice calls for. Less access waits for the tenant's weekend;
 * more is given back at once, and only where the clock took it away.
 */
async function review(
  deps: Publishing,
  input: {
    customerId: string;
    owed: readonly Owed[];
    schools: readonly OperatorSchool[];
    day: string;
    by: string;
  } & Review,
): Promise<DunningOutcome> {
  const outcome: DunningOutcome = { reminded: 0, changed: 0, failed: [] };
  const found = await customerById(deps.business, input.customerId);
  if (!found) return outcome;
  const { customer, contacts, subscriptions } = found;
  const pauses = await pausesOf(deps.business, [customer.id]);
  const clocks = input.owed.map((owed) => ({
    owed,
    days: clockDays(owed, pauses, input.day),
    step: dunningStep(
      {
        dueOn: owed.dueOn,
        totalMinor: owed.invoice.totalMinor,
        owedMinor: owed.owedMinor,
      },
      pauses,
      input.day,
    ),
  }));
  const taken = new Set(
    (
      await stepsOf(
        deps.business,
        clocks.map((clock) => clock.owed.invoice.id),
      )
    ).map((row) => `${row.invoiceId}/${row.step}`),
  );
  const business = await profile(deps.business);
  const billing = contacts.flatMap((contact) =>
    contact.roles.includes("billing") && contact.email ? [contact.email] : [],
  );

  /** Sends a step's email to every billing contact and notes the step taken. */
  const send = async (
    clock: (typeof clocks)[number],
    step: DunningStep,
    emailed: boolean,
  ) => {
    if (taken.has(`${clock.owed.invoice.id}/${step}`)) return;
    const to: string[] = [];
    if (emailed && deps.mail && business)
      for (const address of billing) {
        const language: Language = clock.owed.invoice.language;
        const notice = NOTICE_OF[step];
        try {
          await deps.mail.send(
            dunningEmail({
              step,
              language,
              to: address,
              invoice: {
                number: clock.owed.number,
                currency: clock.owed.invoice.currency,
                dueOn: clock.owed.dueOn,
                totalMinor: clock.owed.invoice.totalMinor,
                owedMinor: clock.owed.owedMinor,
                paymentLinkUrl: clock.owed.invoice.paymentLinkUrl,
              },
              customer: {
                nameEn: customer.legalNameEn,
                nameAr: customer.legalNameAr,
              },
              days: Math.max(clock.days, 0),
              by: notice
                ? addDays(input.day, STEP_DAY[notice] - clock.days - 1)
                : null,
              business: {
                name:
                  language === "ar"
                    ? business.legalNameAr
                    : business.legalNameEn,
                email: business.email,
                bankDetails:
                  language === "ar"
                    ? business.bankDetailsAr
                    : business.bankDetailsEn,
              },
            }),
          );
          to.push(address);
          outcome.reminded += 1;
        } catch (error) {
          console.error(
            JSON.stringify({
              worker: "dunning",
              invoice: clock.owed.number,
              step,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          outcome.failed.push(`dunning:${clock.owed.number}`);
          return;
        }
      }
    await takeStep(deps.business, {
      invoiceId: clock.owed.invoice.id,
      step,
      takenOn: input.day,
      emailedTo: to,
    });
    taken.add(`${clock.owed.invoice.id}/${step}`);
  };

  if (input.remind)
    for (const clock of clocks) {
      if (!clock.step) continue;
      if (!STEP_STANDING[clock.step]) await send(clock, clock.step, true);
      if (showsOverdue(clock.step))
        await addTask(deps.business, {
          customerId: customer.id,
          kind: "call",
          invoiceId: clock.owed.invoice.id,
          key: `dunning/${clock.owed.invoice.id}/call`,
          title: `Call about ${clock.owed.number}, ${clock.days} days overdue`,
          dueOn: input.day,
          assigneeId: customer.accountOwnerId,
          by: input.by,
        });
      if (clock.step === "ended")
        await addTask(deps.business, {
          customerId: customer.id,
          kind: "contract_end",
          invoiceId: clock.owed.invoice.id,
          key: `dunning/${clock.owed.invoice.id}/ended`,
          title: `End the contract: ${clock.owed.number} is ${clock.days} days overdue`,
          dueOn: input.day,
          assigneeId: customer.accountOwnerId,
          by: input.by,
        });
    }

  const tenantId = customer.tenantId;
  if (tenantId) {
    const target = clocks.reduce<SchoolStanding>((most, clock) => {
      const standing = standingAt(clock.step);
      return severer(standing, most) ? standing : most;
    }, "full");
    const applied = await dunningStandingOf(deps.business, tenantId);
    const current = currentStanding(input.schools);
    const driving = clocks.find((clock) => standingAt(clock.step) === target);
    if (severer(target, applied) && input.escalate && driving) {
      const calendar = await deps.calendar(tenantId);
      if (calendar === null) outcome.failed.push(`calendar:${tenantId}`);
      else if (
        weekendNow(calendar, deps.now()) &&
        current !== null &&
        severer(target, current)
      ) {
        const reason = `${driving.owed.number} is ${driving.days} days overdue`;
        if (await deps.setStanding(tenantId, target, reason)) {
          await setDunningStanding(deps.business, {
            tenantId,
            customerId: customer.id,
            standing: target,
            since: input.day,
            reason,
            by: input.by,
          });
          outcome.changed += 1;
          if (target !== "full") {
            const step = STANDING_STEP[target];
            await send(driving, step, input.remind);
            for (const clock of clocks)
              if (clock !== driving && standingAt(clock.step) === target)
                await send(clock, step, false);
          }
        } else outcome.failed.push(`standing:${tenantId}`);
      }
    } else if (severer(applied, target)) {
      const reason =
        target === "full"
          ? "What was overdue is paid"
          : "Enough of what was overdue is paid";
      if (current !== applied) {
        await setDunningStanding(deps.business, {
          tenantId,
          customerId: customer.id,
          standing: target,
          since: input.day,
          reason: `${reason}; an operator had already changed its access`,
          by: input.by,
        });
      } else if (await deps.setStanding(tenantId, target, reason)) {
        await setDunningStanding(deps.business, {
          tenantId,
          customerId: customer.id,
          standing: target,
          since: input.day,
          reason,
          by: input.by,
        });
        outcome.changed += 1;
      } else outcome.failed.push(`standing:${tenantId}`);
    }

    const open = subscriptions.find(
      (row) => row.state === "trial" || row.state === "active",
    );
    const shows = clocks.some((clock) => showsOverdue(clock.step));
    const anyOverdue = clocks.some((clock) => clock.days > 0);
    const notice =
      shows && input.remind && open?.notice === null
        ? "payment_overdue"
        : !anyOverdue && open?.notice === "payment_overdue"
          ? null
          : undefined;
    if (open && notice !== undefined) {
      const reason =
        notice === null
          ? "Nothing is overdue any more"
          : "A payment is two weeks overdue";
      await setNotice(deps.business, {
        id: open.id,
        notice,
        by: input.by,
        reason,
      });
      await publishSubscription(deps, {
        subscriptionId: open.id,
        day: input.day,
        by: input.by,
        reason,
      });
    }
  }
  return outcome;
}

/**
 * The round's turn of every customer's clock: those that owe, those whose
 * access the clock holds back, and those still shown as overdue. One
 * customer's failure is noted and the rest go on.
 */
export async function dunningRound(
  deps: Publishing,
  day: string,
  by: string,
): Promise<DunningOutcome> {
  const owed = await owedInvoices(deps.business);
  const held = await heldStandings(deps.business);
  const shown = (await openSubscriptions(deps.business)).filter(
    (row) => row.notice === "payment_overdue",
  );
  const customerIds = new Set([
    ...owed.map((row) => row.invoice.customerId),
    ...held.map((row) => row.customerId),
    ...shown.map((row) => row.customerId),
  ]);
  const schools = await deps.directory.schools();
  const outcome: DunningOutcome = { reminded: 0, changed: 0, failed: [] };
  for (const customerId of customerIds) {
    const mine = owed.filter((row) => row.invoice.customerId === customerId);
    const tenantId =
      mine[0]?.tenantId ??
      held.find((row) => row.customerId === customerId)?.tenantId ??
      shown.find((row) => row.customerId === customerId)?.tenantId ??
      null;
    try {
      const out = await review(deps, {
        customerId,
        owed: mine,
        schools: schools.filter((school) => school.tenantId === tenantId),
        day,
        by,
        escalate: true,
        remind: true,
      });
      outcome.reminded += out.reminded;
      outcome.changed += out.changed;
      outcome.failed.push(...out.failed);
    } catch (error) {
      console.error(
        JSON.stringify({
          worker: "dunning",
          customerId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      outcome.failed.push(`dunning:${customerId}`);
    }
  }
  return outcome;
}

/**
 * After money is received or credited: gives back at once what the clock
 * took away and is no longer owed, and takes down the overdue notice when
 * nothing is overdue. Never takes anything away, nor sends anything.
 */
export async function settleClock(
  deps: Publishing,
  input: { customerId: string; day: string; by: string },
): Promise<DunningOutcome> {
  const owed = await owedInvoices(deps.business, {
    customerId: input.customerId,
  });
  const found = await customerById(deps.business, input.customerId);
  const tenantId = found?.customer.tenantId ?? null;
  const schools = tenantId
    ? (await deps.directory.schools()).filter(
        (school) => school.tenantId === tenantId,
      )
    : [];
  return review(deps, {
    customerId: input.customerId,
    owed,
    schools,
    day: input.day,
    by: input.by,
    escalate: false,
    remind: false,
  });
}
