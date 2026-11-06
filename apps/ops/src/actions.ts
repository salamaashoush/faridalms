import type { DesignSystemValue } from "@faridalms/ui/system/provider";

import { PAGE_SIZES } from "@faridalms/domain/paging";
import { ENGLISH } from "@faridalms/ui/system/english";

/** Sends the operator to sign in again, then back to this page. */
export function signInAgain() {
  window.location.assign(
    `/auth/login?step=1&return=${encodeURIComponent(window.location.pathname + window.location.search)}`,
  );
}

/** What the console's server functions mean by the codes they throw. */
const CODES: Record<string, string> = {
  FORBIDDEN: "Your role does not cover this. Ask an owner of the console.",
  SOLD: "The school's subscription sets what it may use. Change the subscription instead.",
  NO_BUSINESS:
    "This needs the business database, which this console runs without.",
};

/**
 * What an operator is told when an action fails, or null when the console
 * is sending them to sign in again first.
 */
export function failure(error: unknown, fallback: string): string | null {
  const code = error instanceof Error ? error.message : "";
  if (code === "STEP_UP") {
    signInAgain();
    return null;
  }
  return CODES[code] ?? fallback;
}

/** The design system in the console's English, failures read as the console words them. */
export const CONSOLE_SYSTEM: DesignSystemValue = {
  ...ENGLISH,
  pageSizes: PAGE_SIZES,
  errorMessage: (error) =>
    failure(error, "That did not work. Try again.") ??
    "Sign in again to continue.",
};

/** What a server function answers when it refuses on the merits. */
interface Refusal {
  ok: false;
  message: string;
}

function isRefusal(value: unknown): value is Refusal {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    value.ok === false &&
    "message" in value &&
    typeof value.message === "string"
  );
}

/**
 * Runs a server function for a form or a sheet: null when it worked, else
 * what to tell the operator, whether it refused or threw.
 */
export async function attempt(
  action: () => Promise<unknown>,
  fallback: string,
): Promise<string | null> {
  try {
    const answer = await action();
    return isRefusal(answer) ? answer.message : null;
  } catch (error) {
    return failure(error, fallback) ?? "Sign in again to continue.";
  }
}

/** A server function's answer once refusals are taken out. */
export type Accepted<T> = Exclude<T, Refusal>;

/** What running a server function gave: its answer, or what to say. */
export type Attempted<T> =
  | { ok: true; value: Accepted<T> }
  | { ok: false; message: string };

/**
 * Runs a server function whose answer the form goes on to use, such as the
 * id of what it created: the answer when it worked, else what to say.
 */
export async function attemptWith<T>(
  action: () => Promise<T>,
  fallback: string,
): Promise<Attempted<T>> {
  try {
    const answer = await action();
    if (isRefusal(answer)) return { ok: false, message: answer.message };
    return { ok: true, value: answer as Accepted<T> };
  } catch (error) {
    return {
      ok: false,
      message: failure(error, fallback) ?? "Sign in again to continue.",
    };
  }
}
