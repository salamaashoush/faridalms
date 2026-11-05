import type { setStandingSchema } from "@faridalms/domain/provisioning";
import type * as v from "valibot";

import { lifecycleOf } from "@faridalms/domain/provisioning";

import type { Operator } from "./session";

import { directoryAdmin } from "./directory-admin";
import { explain, setLifecycle } from "./provisioner";

/**
 * Pauses, suspends, restricts or reopens a tenant: its cell first, which
 * enforces it, then the directory, which explains it.
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
  return { ok: true };
}
