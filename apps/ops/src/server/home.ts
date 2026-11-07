import type { Currency } from "@faridalms/domain/subscriptions";

import { owedInvoices } from "@faridalms/database/business/dunning";
import { listInvoices } from "@faridalms/database/business/invoices";
import { dueNextSteps } from "@faridalms/database/business/leads";
import { listOpenSubscriptions } from "@faridalms/database/business/subscriptions";
import { listTasks } from "@faridalms/database/business/tasks";
import { mayOperate } from "@faridalms/domain/operators";
import { addDays } from "@faridalms/domain/school";
import { businessToday } from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";

import { requireArea } from "./access";
import { businessDb } from "./business";
import { directoryAdmin as directory } from "./directory-admin";
import { schoolHealth } from "./health";

/** States a school is served in; one being made or taken away has no health to watch. */
const SERVED = new Set(["active", "read_only", "suspended"]);

const RANK = { red: 0, amber: 1, green: 2 } as const;

/** How far ahead a trial's end counts as ending soon. */
const TRIAL_SOON_DAYS = 14;

/** What is owed past its due day in one currency, and by how many customers. */
export interface OverdueTotal {
  currency: Currency;
  minor: number;
  customers: number;
}

/**
 * The console's first page, for the operator signed in: what is due for
 * them today (their calls and tasks, their leads' next steps, and drafts to
 * issue for finance), the figures of the areas their roles work, and the
 * schools that need help. Nothing an operator's roles do not open is read.
 */
export const getHome = createServerFn({ method: "GET" }).handler(async () => {
  const access = await requireArea("readTenants");
  const me = access.operator.id;
  const business = businessDb();
  const today = businessToday();
  const may = (area: Parameters<typeof mayOperate>[1]) =>
    Boolean(business) && mayOperate(access.roles, area);
  const schools = (await directory().schools()).filter((school) =>
    SERVED.has(school.tenantState),
  );
  const [health, tasks, steps, owed, drafts, open] = await Promise.all([
    schoolHealth(
      { directory: directory(), business },
      schools,
      new Date(),
      today,
    ),
    business && may("customers") ? listTasks(business, { open: true }) : null,
    business && may("leads") ? dueNextSteps(business, today) : null,
    business && may("readBilling") ? owedInvoices(business) : null,
    business && may("billing")
      ? listInvoices(business, { states: ["draft"] })
      : null,
    business && may("readSubscriptions")
      ? listOpenSubscriptions(business)
      : null,
  ]);
  const rows = schools.flatMap((school) => {
    const held = health.get(school.id);
    if (!held) return [];
    const done = held.onboarding.applies.filter(
      (item) => held.onboarding.reached[item],
    ).length;
    return [
      {
        id: school.id,
        slug: school.slug,
        name: school.nameEn ?? school.nameAr ?? school.slug,
        level: held.level,
        reasons: held.reasons,
        onboarding: { done, total: held.onboarding.applies.length },
        signedIn7d: school.usage?.signedIn7d ?? null,
      },
    ];
  });
  const overdue = new Map<
    Currency,
    { minor: number; customers: Set<string> }
  >();
  for (const row of owed ?? []) {
    if (row.dueOn >= today) continue;
    const total = overdue.get(row.invoice.currency) ?? {
      minor: 0,
      customers: new Set<string>(),
    };
    total.minor += row.owedMinor;
    total.customers.add(row.invoice.customerId);
    overdue.set(row.invoice.currency, total);
  }
  const soon = addDays(today, TRIAL_SOON_DAYS);
  const trials = (open ?? []).filter(
    ({ subscription }) =>
      subscription.state === "trial" &&
      subscription.trialEndsOn !== null &&
      subscription.trialEndsOn <= soon,
  );
  return {
    today,
    me,
    myName: access.operator.name,
    /** Open tasks due by today that are this operator's, or nobody's yet. */
    tasks: (tasks ?? []).filter(
      ({ task }) =>
        task.dueOn <= today &&
        (task.assigneeId === me || task.assigneeId === null),
    ),
    /** Leads whose next step is due by today, this operator's or nobody's. */
    steps: (steps ?? []).filter(
      (lead) => lead.ownerId === me || lead.ownerId === null,
    ),
    drafts: drafts
      ? {
          count: drafts.length,
          oldest:
            drafts
              .map(({ invoice }) => invoice.forDay)
              .toSorted()
              .at(0) ?? null,
        }
      : null,
    overdue: owed
      ? [...overdue]
          .map(([currency, total]): OverdueTotal => ({
            currency,
            minor: total.minor,
            customers: total.customers.size,
          }))
          .toSorted((a, b) => b.minor - a.minor)
      : null,
    trials: open
      ? {
          count: trials.length,
          over: trials.filter(
            ({ subscription }) =>
              subscription.trialEndsOn !== null &&
              subscription.trialEndsOn < today,
          ).length,
        }
      : null,
    nextSteps: steps ? steps.length : null,
    schools: {
      served: rows.length,
      red: rows.filter((row) => row.level === "red").length,
      amber: rows.filter((row) => row.level === "amber").length,
      needing: rows
        .filter((row) => row.level !== "green")
        .toSorted(
          (a, b) =>
            RANK[a.level] - RANK[b.level] || a.name.localeCompare(b.name),
        ),
    },
  };
});
