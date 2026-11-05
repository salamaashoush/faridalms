import type { DirectorySchool } from "@faridalms/database/directory/client";

import { clientAddress } from "@faridalms/domain/forwarded";
import { platformName } from "@faridalms/domain/hosts";

import type { RequestContext } from "./context";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare's own limit on a token; anything longer is not one. */
const MAX_TOKEN = 2048;

export interface TurnstileCheck {
  token: string;
  /** The visitor's address, which Cloudflare weighs with the token. */
  remoteIp: string | null;
  /** The action the page's widget names, so a token from another form does not pass. */
  action: string;
  /** Whether the host the challenge was solved on serves this school. */
  hostAllowed: (hostname: string) => Promise<boolean>;
}

export interface Turnstile {
  /** The public key the website's widget renders with. */
  siteKey: string;
  verify: (check: TurnstileCheck) => Promise<boolean>;
}

interface Siteverify {
  success?: boolean;
  "error-codes"?: string[];
  hostname?: string;
  action?: string;
}

/**
 * Cloudflare Turnstile, checked on the server through siteverify: the token
 * the browser hands over proves nothing until Cloudflare says it was solved,
 * for this action, on a host of this school, and has not been used before.
 * Transient failures are retried with one idempotency key, so a retry never
 * spends the token twice; when Cloudflare cannot answer, the form is refused
 * rather than let through unchecked.
 */
export function createTurnstile(settings: {
  siteKey: string;
  secretKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
}): Turnstile {
  const send = settings.fetch ?? fetch;
  const timeoutMs = settings.timeoutMs ?? 5000;
  const delays = settings.retryDelaysMs ?? [500, 1500];
  const ask = async (body: string): Promise<Siteverify | null> => {
    try {
      const response = await send(SITEVERIFY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status >= 500) return null;
      return (await response.json()) as Siteverify;
    } catch {
      return null;
    }
  };
  return {
    siteKey: settings.siteKey,
    verify: async (check) => {
      const token = check.token.trim();
      if (!token || token.length > MAX_TOKEN) return false;
      const body = JSON.stringify({
        secret: settings.secretKey,
        response: token,
        ...(check.remoteIp ? { remoteip: check.remoteIp } : {}),
        idempotency_key: crypto.randomUUID(),
      });
      let answer = await ask(body);
      for (const delay of delays) {
        const transient =
          answer === null ||
          (answer.success !== true &&
            (answer["error-codes"] ?? []).includes("internal-error"));
        if (!transient) break;
        await new Promise((resolve) => setTimeout(resolve, delay));
        answer = await ask(body);
      }
      if (answer?.success !== true) return false;
      if (answer.action && answer.action !== check.action) return false;
      return answer.hostname ? check.hostAllowed(answer.hostname) : true;
    },
  };
}

/** Turnstile when both keys are set, none otherwise; one key alone is a mistake. */
export function turnstileFrom(env: {
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}): Turnstile | null {
  const { TURNSTILE_SITE_KEY: siteKey, TURNSTILE_SECRET_KEY: secretKey } = env;
  if (!siteKey && !secretKey) return null;
  if (!siteKey || !secretKey)
    throw new Error(
      "TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set together or not at all",
    );
  return createTurnstile({ siteKey, secretKey });
}

/**
 * Whether a host a challenge was solved on is one this school answers at:
 * its platform names, its own hosts, or the cell's own host, where the site
 * is reached under `/site/<school>`.
 */
export async function servesSchool(
  context: Pick<RequestContext, "domains" | "directory">,
  school: DirectorySchool,
  hostname: string,
) {
  const name = hostname.toLowerCase();
  if (
    [
      platformName(school.slug, "site", context.domains),
      platformName(school.slug, "portal", context.domains),
      school.hosts.site,
      school.hosts.portal,
      school.appHost,
      context.domains.portal,
    ].includes(name)
  )
    return true;
  const routed = await context.directory.byHost(name);
  return routed?.school.schoolId === school.schoolId;
}

/**
 * Where the bare domain asks the visitor to prove they are a person: the
 * Turnstile token from its sign-in, reset or demonstration form, solved on the bare domain
 * itself for that action. Without Turnstile configured it passes, and each
 * form's own limits are the only check.
 */
export async function bareHumanCheck(
  context: RequestContext,
  answer: string | undefined,
  action: "sign_in" | "reset" | "demo",
): Promise<boolean> {
  const turnstile = context.turnstile;
  if (!turnstile) return true;
  return turnstile.verify({
    token: answer ?? "",
    remoteIp: clientAddress(
      context.headers.get("x-forwarded-for"),
      context.trustedProxyHops,
    ),
    action,
    hostAllowed: (hostname) =>
      Promise.resolve(hostname === context.domains.portal),
  });
}
