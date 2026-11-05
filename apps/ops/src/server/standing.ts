import type { setStandingSchema } from "@faridalms/domain/provisioning";
import type * as v from "valibot";

import { lifecycleOf } from "@faridalms/domain/provisioning";

import type { Operator } from "./session";

import { directoryAdmin } from "./directory-admin";
import { entitlementsChanged, explain, setLifecycle } from "./provisioner";

/**
 * Tells a tenant's cell the directory changed what its schools may use, so
 * its servers read it at once. False when the cell could not be told: they
 * read it within the directory cache's minute anyway.
 */
export async function tellCell(
  operator: Operator,
  tenantId: string,
): Promise<boolean> {
  const answer = await entitlementsChanged(operator, { tenantId });
  if (!answer.ok)
    console.error(
      JSON.stringify({
        worker: "entitlements_changed",
        tenantId,
        error: explain(answer),
      }),
    );
  return answer.ok;
}

/**
 * Pauses, suspends, restricts or reopens a tenant: its cell first, which
 * enforces it, then the directory, which explains it and holds whether it
 * is restricted, which its cell is then told to read.
 */
export async function changeStanding(
  operator: Operator,
  input: v.InferOutput<typeof setStandingSchema>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const lifecycle = lifecycleOf(input.standing);
  const answer = await setLifecycle(operator, {
    tenantId: input.tenantId,
    lifecycle,
    reason: input.reason,
  });
  if (!answer.ok) return { ok: false, message: explain(answer) };
  await directoryAdmin().setTenantState({
    tenantId: input.tenantId,
    state: lifecycle,
    access: input.standing === "suspended" ? "full" : input.standing,
    operatorId: operator.id,
    reason: input.reason,
  });
  await tellCell(operator, input.tenantId);
  return { ok: true };
}
