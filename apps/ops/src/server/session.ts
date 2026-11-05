import { getCookie } from "@tanstack/react-start/server";
import * as v from "valibot";

import { opsEnv } from "./env";
import { seal, unseal } from "./seal";

export interface Operator {
  /** Opaque: a digest of the identity provider's issuer and subject. */
  id: string;
  /** Kept in the business database's operators, never in the directory. */
  name: string;
  email: string | null;
  /** When the identity provider last asked them to sign in, in seconds. */
  authAt: number;
}

export const SESSION_HOURS = 8;

const operatorSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.nullable(v.string()),
  authAt: v.number(),
});

const secure = () => opsEnv().OPS_ORIGIN.startsWith("https://");
/** `__Host-` binds the cookie to the console's own host over HTTPS. */
export const sessionCookie = () =>
  secure() ? "__Host-ops_session" : "ops_session";
export const loginCookie = () => (secure() ? "__Host-ops_login" : "ops_login");

export function cookie(name: string, value: string, maxAge: number) {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(secure() ? ["Secure"] : []),
  ].join("; ");
}

export function sealSession(operator: Operator) {
  const maxAge = SESSION_HOURS * 60 * 60;
  return cookie(
    sessionCookie(),
    seal("session", operator, Math.floor(Date.now() / 1000) + maxAge),
    maxAge,
  );
}

export function currentOperator(): Operator | null {
  return unseal("session", getCookie(sessionCookie()), operatorSchema);
}

export function requireOperator(): Operator {
  const operator = currentOperator();
  if (!operator) throw new Error("UNAUTHORIZED");
  return operator;
}
