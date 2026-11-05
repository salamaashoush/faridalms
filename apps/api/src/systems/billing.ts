import {
  billingQuery,
  INTAKE_SIGNATURE_HEADER,
  INTAKE_TIMESTAMP_HEADER,
  signIntake,
} from "@faridalms/domain/intake";
import { schoolBillingSchema } from "@faridalms/domain/invoices";
import * as v from "valibot";

import { readProcedure, requireCapability } from "../core/procedure";

/**
 * The school's invoices, for its administrators: asked of the operator
 * console, signed, on each read, so the cell keeps none of it. Where the
 * console is not set up or does not answer, billing is unavailable and
 * nothing else in the school is touched.
 */
export const overview = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "billing:read");
  if (!context.intake) return { available: false as const };
  const query = billingQuery(context.tenantId);
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const response = await fetch(
      new URL(`billing?${query}`, context.intake.url),
      {
        headers: {
          [INTAKE_TIMESTAMP_HEADER]: String(timestamp),
          [INTAKE_SIGNATURE_HEADER]: signIntake({
            secret: context.intake.secret,
            timestamp,
            body: query,
          }),
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) return { available: false as const };
    const billing = v.safeParse(schoolBillingSchema, await response.json());
    return billing.success
      ? { available: true as const, ...billing.output }
      : { available: false as const };
  } catch {
    return { available: false as const };
  }
});
