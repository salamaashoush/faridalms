import type { LeadIntake } from "@faridalms/domain/leads";

import {
  INTAKE_SIGNATURE_HEADER,
  INTAKE_TIMESTAMP_HEADER,
  signIntake,
} from "@faridalms/domain/intake";
import { createHash } from "node:crypto";

/** Where leads go, and the secret they are signed with, shared with the console. */
export interface Intake {
  url: string;
  secret: string;
}

/**
 * Sends a lead to the operator console, signed. False when it did not
 * arrive; the console takes the same intake id once, so sending again is
 * safe.
 */
export async function sendLead(
  intake: Intake,
  lead: LeadIntake,
): Promise<boolean> {
  const body = JSON.stringify(lead);
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const response = await fetch(intake.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INTAKE_TIMESTAMP_HEADER]: String(timestamp),
        [INTAKE_SIGNATURE_HEADER]: signIntake({
          secret: intake.secret,
          timestamp,
          body,
        }),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The same id for the same question on the same day, so asking twice makes
 * one lead: a digest shaped as a UUID.
 */
export function stableIntakeId(parts: readonly string[]): string {
  const hex = createHash("sha256").update(parts.join(":")).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
