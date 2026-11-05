import {
  listOperators,
  operatorById,
  setOperator,
  signInOperator,
} from "@faridalms/database/business/operators";
import { mayOperate } from "@faridalms/domain/operators";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import { business, businessUrl } from "./harness";

describe("operators", () => {
  test("the first to sign in owns the console, anyone after waits for a role", async () => {
    const owner = await signInOperator(business(), {
      id: "op-owner",
      name: "Salama Ashoush",
      email: "salama@example.com",
    });
    expect(owner.roles).toEqual(["owner"]);
    const later = await signInOperator(business(), {
      id: "op-later",
      name: "Sam Sales",
      email: "sales@example.com",
    });
    expect(later.roles).toEqual([]);
    const again = await signInOperator(business(), {
      id: "op-owner",
      name: "Salama A.",
      email: "salama@example.com",
    });
    expect(again).toMatchObject({ roles: ["owner"], name: "Salama A." });
    expect(
      (await listOperators(business())).map((row) => row.id).toSorted(),
    ).toEqual(["op-later", "op-owner"]);
  });

  test("an owner gives roles with a reason, and the console keeps an owner", async () => {
    expect(
      await setOperator(business(), {
        id: "op-later",
        roles: ["sales"],
        state: "active",
        by: "op-owner",
        reason: "Joined to sell",
      }),
    ).toBe("saved");
    const sales = await operatorById(business(), "op-later");
    expect(sales?.roles).toEqual(["sales"]);
    expect(mayOperate(sales?.roles ?? [], "leads")).toBe(true);
    expect(mayOperate(sales?.roles ?? [], "billing")).toBe(false);
    expect(
      await setOperator(business(), {
        id: "op-owner",
        roles: ["finance"],
        state: "active",
        by: "op-owner",
        reason: "Leaving no owner",
      }),
    ).toBe("last_owner");
    expect(
      await setOperator(business(), {
        id: "nobody",
        roles: [],
        state: "disabled",
        by: "op-owner",
        reason: "No such operator",
      }),
    ).toBe("missing");
  });

  test("the event log is appended to and never changed", async () => {
    const sql = new SQL(businessUrl());
    try {
      const events = await sql<{ action: string; reason: string | null }[]>`
        select action, reason from business_events order by occurred_at`;
      expect(events.map((row) => row.action)).toEqual([
        "operator.first_owner",
        "operator.update",
      ]);
      expect(
        await sql`update business_events set reason = 'changed'`.catch(
          (error: Error) => error.message,
        ),
      ).toContain("permission denied");
    } finally {
      await sql.close();
    }
  });
});
