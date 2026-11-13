import { describe, expect, test } from "bun:test";

import type { CellTransaction } from "../src/context";

import {
  emergencyContactsOf,
  insertEmergencyContact,
  removeEmergencyContact,
  updateEmergencyContact,
} from "../src/stores/emergency-contacts";
import { appCell, harness, probe } from "./harness";

const ROLLBACK = new Error("roll back");

/** Always rolled back, so the seed the other suites read stays as it was. */
async function rolledBack<T>(
  tenantId: string,
  work: (tx: CellTransaction) => Promise<T>,
): Promise<T> {
  const cell = appCell();
  let result: T | undefined;
  try {
    await cell
      .withTenant(
        {
          tenantId,
          requestId: "emergency-contacts",
          actor: { kind: "system" },
        },
        "write",
        async (tx) => {
          result = await work(tx);
          throw ROLLBACK;
        },
      )
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error;
      });
  } finally {
    await cell.close();
  }
  return result as T;
}

async function someStudent(tenantId: string): Promise<string> {
  const [row] = (await harness().su.unsafe(
    `select user_id as id from core.user_roles
     where tenant_id = $1 and role = 'student' and status = 'active'
     order by created_at limit 1`,
    [tenantId],
  )) as { id: string }[];
  if (!row) throw new Error("the seed has a student");
  return row.id;
}

const fields = {
  name: "Huda Saleh",
  relationship: "Sister",
  phone: "+201000000091",
  otherPhone: null,
  email: null,
  callOrder: 2,
  notes: null,
};

describe("a person's own emergency contacts", () => {
  test("are listed in calling order, change only from the version read, and leave the list once removed", async () => {
    const { a } = harness();
    const userId = await someStudent(a.tenantId);
    const outcome = await rolledBack(a.tenantId, async (tx) => {
      const scope = { tenantId: a.tenantId, userId };
      const second = await insertEmergencyContact(tx, { ...scope, ...fields });
      const first = await insertEmergencyContact(tx, {
        ...scope,
        ...fields,
        name: "Mona Adel",
        callOrder: 1,
      });
      const listed = (await emergencyContactsOf(tx, scope)).map(
        (row) => row.id,
      );
      const stale = await updateEmergencyContact(tx, {
        ...scope,
        ...fields,
        id: second.id,
        expectedVersion: second.version + 1,
      });
      const moved = await updateEmergencyContact(tx, {
        ...scope,
        ...fields,
        id: second.id,
        expectedVersion: second.version,
        callOrder: 1,
        name: "Amal Adel",
      });
      const elsewhere = await updateEmergencyContact(tx, {
        ...scope,
        ...fields,
        userId: crypto.randomUUID(),
        id: first.id,
        expectedVersion: first.version,
      });
      const removed = await removeEmergencyContact(tx, {
        ...scope,
        id: first.id,
        expectedVersion: first.version,
      });
      const after = (await emergencyContactsOf(tx, scope)).map((row) => row.id);
      return { first, second, listed, stale, moved, elsewhere, removed, after };
    });
    expect(outcome.listed.indexOf(outcome.first.id)).toBeLessThan(
      outcome.listed.indexOf(outcome.second.id),
    );
    expect(outcome.stale).toBeNull();
    expect(outcome.moved?.version).toBe(outcome.second.version + 1);
    expect(outcome.elsewhere).toBeNull();
    expect(outcome.removed).toEqual({ id: outcome.first.id });
    expect(outcome.after).toContain(outcome.second.id);
    expect(outcome.after).not.toContain(outcome.first.id);
  });

  test("refuse a phone that is not E.164, an empty name and a place outside the order", async () => {
    const { a } = harness();
    const userId = await someStudent(a.tenantId);
    const held: Record<string, string> = {
      name: "'Huda'",
      phone: "'+201000000091'",
      other_phone: "null",
      email: "null",
      call_order: "1",
    };
    for (const [column, value] of [
      ["phone", "0100 000 0091"],
      ["other_phone", "12"],
      ["name", ""],
      ["call_order", "0"],
      ["email", "Huda@Example.com"],
    ] as const) {
      const values = {
        ...held,
        [column]: column === "call_order" ? "$3::smallint" : "$3",
      };
      const result = await probe("app", a.tenantId, [
        {
          text: `insert into core.emergency_contacts
                   (tenant_id, user_id, ${Object.keys(values).join(", ")})
                 values ($1, $2, ${Object.values(values).join(", ")})`,
          params: [a.tenantId, userId, value],
        },
      ]);
      expect(result.error?.code).toBe("23514");
    }
  });

  test("the app cannot delete one; only retention removes an erased person's", async () => {
    const { a } = harness();
    const userId = await someStudent(a.tenantId);
    const result = await probe("app", a.tenantId, [
      {
        text: "delete from core.emergency_contacts where tenant_id = $1 and user_id = $2",
        params: [a.tenantId, userId],
      },
    ]);
    expect(result.error?.code).toBe("42501");
  });
});
