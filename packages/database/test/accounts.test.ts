import { describe, expect, test } from "bun:test";

import { ensureAccount } from "../src/stores/accounts";
import { appCell, harness } from "./harness";

/** A student of the tenant who has never had an account. */
async function withoutAccount(tenantId: string): Promise<string> {
  const [row] = (await harness().su.unsafe(
    `select e.user_id as id from core.enrollments e
     where e.tenant_id = $1 and e.role = 'student' and e.status = 'active'
       and not exists (select 1 from core.accounts a
                       where a.tenant_id = e.tenant_id and a.user_id = e.user_id)
     limit 1`,
    [tenantId],
  )) as { id: string }[];
  if (!row) throw new Error("every seeded student has an account");
  return row.id;
}

/** Whether another session is waiting on a lock, as the second opener does. */
async function someoneWaits(): Promise<boolean> {
  const [row] = (await harness().su.unsafe(
    `select count(*)::int as waiting from pg_stat_activity
     where datname = current_database() and wait_event_type = 'Lock'`,
  )) as { waiting: number }[];
  return (row?.waiting ?? 0) > 0;
}

describe("a student's account", () => {
  test("opened by two transactions at once is one account, which both use", async () => {
    const { a, su } = harness();
    const userId = await withoutAccount(a.tenantId);
    const cell = appCell();
    const unit = {
      tenantId: a.tenantId,
      requestId: "accounts",
      actor: { kind: "system" as const },
    };
    try {
      const firstOpened = Promise.withResolvers<void>();
      const secondWaiting = Promise.withResolvers<void>();
      const first = cell.withTenant(unit, "write", async (tx) => {
        const opened = await ensureAccount(tx, {
          tenantId: a.tenantId,
          userId,
        });
        firstOpened.resolve();
        await secondWaiting.promise;
        return opened;
      });
      await firstOpened.promise;
      const second = cell.withTenant(unit, "write", (tx) =>
        ensureAccount(tx, { tenantId: a.tenantId, userId }),
      );
      while (!(await someoneWaits())) await Bun.sleep(10);
      secondWaiting.resolve();

      const [one, other] = await Promise.all([first, second]);
      expect(one).toMatchObject({ created: true });
      expect(other).toEqual({
        accountId: one?.accountId ?? "",
        created: false,
      });
    } finally {
      await cell.close();
      await su.unsafe(
        "delete from core.accounts where tenant_id = $1 and user_id = $2",
        [a.tenantId, userId],
      );
    }
  });
});
