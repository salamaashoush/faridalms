import { demoRequestSchema } from "@faridalms/domain/product";
import { ORPCError } from "@orpc/server";

import { publicProcedure } from "../core/procedure";
import { ipPrefix } from "../core/session";

/** Faster than a person can type a name, a school and an address. */
const MIN_FILL_MS = 3000;
const HOUR_MS = 60 * 60 * 1000;
const PER_NETWORK = 3;
const OVERALL = 60;

/**
 * Requests in the last hour, by network and in all. Kept in memory: the
 * product site runs one API, and a restart forgetting an hour of requests
 * costs at most a few more emails.
 */
const sent: { at: number; network: string }[] = [];

function allowed(network: string, now: number) {
  while (sent[0] && now - sent[0].at > HOUR_MS) sent.shift();
  if (sent.length >= OVERALL) return false;
  return sent.filter((row) => row.network === network).length < PER_NETWORK;
}

const ROLE = {
  leader: "School leader",
  teacher: "Teacher",
  it: "IT",
  parent: "Parent",
  other: "Other",
} as const;
const SIZE = {
  under_200: "Fewer than 200",
  "200_1000": "200 to 1,000",
  over_1000: "More than 1,000",
} as const;

/**
 * A demonstration request from the product site, emailed to the product's
 * inbox. A form filled by a script, or faster than a person can type, is
 * answered as if received and dropped, so the script learns nothing.
 */
export const requestDemo = publicProcedure
  .input(demoRequestSchema)
  .handler(async ({ input, context }) => {
    if (!context.productInbox || !context.mail)
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "product.unavailable",
      });
    if (input.website || input.elapsed < MIN_FILL_MS) return { received: true };
    const now = Date.now();
    const network =
      ipPrefix(context.headers, context.trustedProxyHops) ?? "unknown";
    if (!allowed(network, now))
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: "product.too_many",
      });
    sent.push({ at: now, network });
    await context.mail.send({
      to: context.productInbox,
      subject: `Demo request: ${input.school}`,
      text: [
        `Name: ${input.name}`,
        `Email: ${input.email}`,
        `School: ${input.school}`,
        `Role: ${ROLE[input.role]}`,
        `Students: ${input.size ? SIZE[input.size] : "not given"}`,
        `Phone: ${input.phone || "not given"}`,
        `Language: ${input.locale === "ar" ? "Arabic" : "English"}`,
        "",
        input.message || "(no message)",
      ].join("\n"),
      reference: `demo/${crypto.randomUUID()}`,
    });
    return { received: true };
  });
