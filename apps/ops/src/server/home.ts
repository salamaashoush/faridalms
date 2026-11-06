import { listTasks } from "@faridalms/database/business/tasks";
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

/**
 * The console's first page: the schools that need someone, red before
 * amber, the onboardings that have stalled, and today's tasks for those
 * who work with customers.
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
  const tasks =
    business && mayOperate(access.roles, "customers")
      ? await listTasks(business, { open: true })
      : [];
  return {
    today,
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
        done: row.onboarding.applies.filter(
          (item) => row.onboarding.reached[item],
        ).length,
        total: row.onboarding.applies.length,
      })),
    tasks,
    names: business ? await operatorNames(business) : {},
  };
});
