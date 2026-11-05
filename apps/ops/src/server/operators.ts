import type { BusinessDb } from "@faridalms/database/business/client";
import type { OperatorArea } from "@faridalms/domain/operators";

import {
  listOperators,
  setOperator,
} from "@faridalms/database/business/operators";
import { mayOperate, OPERATOR_ROLES } from "@faridalms/domain/operators";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { requireArea } from "./access";
import { requireBusiness } from "./business";
import { PAYMOB_OPERATOR } from "./paymob";
import { SYSTEM_OPERATOR } from "./publication";

/** Each operator's name by id, for a history that says who did what. */
export async function operatorNames(
  db: BusinessDb,
): Promise<Record<string, string>> {
  const rows = await listOperators(db);
  return {
    [SYSTEM_OPERATOR]: "Daily round",
    [PAYMOB_OPERATOR.id]: PAYMOB_OPERATOR.name,
    "intake:demo_form": "The product site",
    "intake:module_interest": "A school's administrator",
    ...Object.fromEntries(rows.map((row) => [row.id, row.name])),
  };
}

/** The active operators who may work in an area, to name one for something. */
export async function operatorsWhoMay(db: BusinessDb, area: OperatorArea) {
  const rows = await listOperators(db);
  return rows
    .filter((row) => row.state === "active" && mayOperate(row.roles, area))
    .map((row) => ({ id: row.id, name: row.name }));
}

const saveOperatorSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  roles: v.pipe(v.array(v.picklist(OPERATOR_ROLES)), v.maxLength(4)),
  state: v.picklist(["active", "disabled"]),
  reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});

/** Everyone who has signed in to the console, with their roles. */
export const getOperators = createServerFn({ method: "GET" }).handler(
  async () => {
    const { operator } = await requireArea("operators");
    const rows = await listOperators(requireBusiness());
    return {
      me: operator.id,
      operators: rows.map((row) => ({
        ...row,
        lastSignedInAt: row.lastSignedInAt?.toISOString() ?? null,
      })),
    };
  },
);

export const saveOperator = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof saveOperatorSchema>) =>
    v.parse(saveOperatorSchema, input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const { operator } = await requireArea("operators");
      const outcome = await setOperator(requireBusiness(), {
        ...data,
        roles: [...new Set(data.roles)],
        by: operator.id,
      });
      if (outcome === "missing")
        return { ok: false, message: "No such operator." };
      if (outcome === "last_owner")
        return {
          ok: false,
          message:
            "The console needs at least one active owner. Make someone else an owner first.",
        };
      return { ok: true };
    },
  );
