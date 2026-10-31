import type {
  ProvisionResult,
  ProvisionTenant,
  ReissueInvite,
  ReissueResult,
} from "@faridalms/domain/provisioning";

import {
  PROVISION_AUDIENCE,
  PROVISION_TOKEN_SECONDS,
} from "@faridalms/domain/provisioning";
import { SignJWT } from "jose";

import type { Operator } from "./session";

import { opsEnv } from "./env";

export type ProvisionerAnswer<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string | null };

/** A token for one call, naming the operator for the cell's audit log. */
async function tokenFor(operator: Operator) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ name: operator.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(operator.id)
    .setAudience(PROVISION_AUDIENCE)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + PROVISION_TOKEN_SECONDS)
    .sign(new Uint8Array(Buffer.from(opsEnv().PROVISION_SECRET, "base64")));
}

async function post<T>(
  operator: Operator,
  path: string,
  body: unknown,
): Promise<ProvisionerAnswer<T>> {
  let response: Response;
  try {
    response = await fetch(new URL(path, opsEnv().PROVISION_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await tokenFor(operator)}`,
      },
      body: JSON.stringify(body),
      // The cell's transaction may run a minute; the answer comes after it.
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    return { ok: false, code: "UNREACHABLE", message: null };
  }
  const answer = (await response.json().catch(() => null)) as {
    code?: string;
    message?: string;
  } | null;
  if (!response.ok)
    return {
      ok: false,
      code: answer?.code ?? `HTTP_${response.status}`,
      message: answer?.message ?? null,
    };
  return { ok: true, value: answer as T };
}

export const provisionTenant = (operator: Operator, request: ProvisionTenant) =>
  post<ProvisionResult>(operator, "/v1/tenants", request);

export const reissueInvite = (operator: Operator, request: ReissueInvite) =>
  post<ReissueResult>(operator, "/v1/invites", request);

/** What an operator is told when the cell refuses or cannot be reached. */
export function explain(answer: { code: string; message: string | null }) {
  switch (answer.message ?? answer.code) {
    case "sign_in.not_sent":
      return "The email to the administrator could not be sent, so the cell kept nothing. Check the address and try again.";
    case "sign_in.no_email":
      return "The cell has no email gateway, so it cannot send the administrator a link. Nothing was created.";
    case "sign_in.no_address":
      return "That administrator has no email address the cell can write to.";
    case "administrator.not_found":
      return "Nobody with that email runs this school. Use the address the school was created with, or leave it empty for the first administrator.";
    case "tenant.not_in_directory":
    case "tenant.directory_differs":
      return "The cell does not see these schools in its directory. Check that the console and the cell use the same directory.";
    case "tenant.not_active":
      return "The cell holds this tenant, but it is not active.";
    case "login_identity.login_name_taken":
      return "Someone in this tenant already signs in with that email.";
    case "account.disabled":
      return "The administrator's account is turned off, so no link can open it.";
    case "validation":
      return "The cell refused the details as invalid.";
    case "UNAUTHORIZED":
      return "The cell refused the console's token. Check that PROVISION_SECRET is the same on both sides and that the clocks agree.";
    case "UNREACHABLE":
      return "The provisioner could not be reached or did not answer. Submit again to finish: a retry never creates the school twice.";
    default:
      return `The cell answered ${answer.code}${answer.message ? ` (${answer.message})` : ""}.`;
  }
}
