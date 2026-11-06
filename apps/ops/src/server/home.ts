import type { Currency } from "@faridalms/domain/subscriptions";

import { owedInvoices } from "@faridalms/database/business/dunning";
import { dueNextSteps, listLeads } from "@faridalms/database/business/leads";
import { listTasks } from "@faridalms/database/business/tasks";
import { leadOpen } from "@faridalms/domain/leads";
import { mayOperate } from "@faridalms/domain/operators";
import { businessToday } from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";

import { requireArea } from "./access";
import { businessDb } from "./business";
import { directoryAdmin as directory } from "./directory-admin";
import { schoolHealth } from "./health";
import { operatorNames } from "./operators";

/** States a school is served in; one being made or taken away has no health to watch. */
const SERVED = new Set(["active", "read_only", "suspended"]);

const RANK = { red: 0, amber: 1, green: 2 } as const;

/** What is owed past its due day in one currency, and by how many customers. */
export interface OverdueTotal {
  currency: Currency;
  minor: number;
  customers: number;
}

/**
 * The console's first page: how the schools are doing, the ones that need
 * someone (red before amber), the onboardings that have stalled, and, for
 * the roles that work them, the open tasks, leads and money overdue.
 */
export const getHome = createServerFn({ method: "GET" }).handler(async () => {
  const access = await requireArea("readTenants");
  const business = businessDb();
  const today = businessToday();
  const schools = (await directory().schools()).filter((school) =>
    SERVED.has(school.tenantState),
  );
  const health = await schoolHealth(
    { directory: directory(), business },
    schools,
    new Date(),
    today,
  );
  const rows = schools.flatMap((school) => {
    const held = health.get(school.id);
    return held
      ? [
          {
            id: school.id,
            slug: school.slug,
            name: school.nameEn ?? school.nameAr ?? school.slug,
            ...held,
          },
        ]
      : [];
  });
  const may = (area: Parameters<typeof mayOperate>[1]) =>
    Boolean(business) && mayOperate(access.roles, area);
  const [tasks, leads, leadSteps, owed, names] = await Promise.all([
    business && may("customers") ? listTasks(business, { open: true }) : [],
    business && may("leads") ? listLeads(business) : null,
    business && may("leads") ? dueNextSteps(business, today) : null,
    business && may("readBilling") ? owedInvoices(business) : null,
    business ? operatorNames(business) : {},
  ]);
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
  const progress = (row: (typeof rows)[number]) => ({
    done: row.onboarding.applies.filter((item) => row.onboarding.reached[item])
      .length,
    total: row.onboarding.applies.length,
  });
  return {
    today,
    summary: {
      served: rows.length,
      healthy: rows.filter((row) => row.level === "green").length,
      red: rows.filter((row) => row.level === "red").length,
      amber: rows.filter((row) => row.level === "amber").length,
      onboarding: rows.filter((row) => {
        const { done, total } = progress(row);
        return done < total;
      }).length,
      stalled: rows.filter((row) => row.onboarding.stalled).length,
    },
    attention: rows
      .filter((row) => row.level !== "green")
      .toSorted(
        (a, b) => RANK[a.level] - RANK[b.level] || a.name.localeCompare(b.name),
      ),
    stalled: rows
      .filter((row) => row.onboarding.stalled)
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        ...progress(row),
      })),
    tasks,
    leads: leads
      ? {
          open: leads.filter((lead) => leadOpen(lead.state)).length,
          stepsDue: leadSteps?.length ?? 0,
        }
      : null,
    overdue: owed
      ? [...overdue].map(([currency, total]): OverdueTotal => ({
          currency,
          minor: total.minor,
          customers: total.customers.size,
        }))
      : null,
    names,
  };
});
