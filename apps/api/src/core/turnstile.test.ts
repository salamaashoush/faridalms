import { describe, expect, it } from "vitest";

import { createTurnstile, turnstileFrom } from "./turnstile";

type Answer = Record<string, unknown> | "down" | 500;

/** Cloudflare answering in turn, with every request it was sent. */
function cloudflare(...answers: Answer[]) {
  const asked: { url: string; body: Record<string, unknown> }[] = [];
  const fetch: typeof globalThis.fetch = (async (
    url: string,
    init?: RequestInit,
  ) => {
    asked.push({
      url,
      body: JSON.parse(
        typeof init?.body === "string" ? init.body : "{}",
      ) as Record<string, unknown>,
    });
    const answer = answers.shift() ?? { success: false };
    if (answer === "down") throw new TypeError("fetch failed");
    if (answer === 500) return new Response("", { status: 500 });
    return Response.json(answer);
  }) as typeof fetch;
  return {
    asked,
    turnstile: createTurnstile({
      siteKey: "site",
      secretKey: "secret",
      fetch,
      retryDelaysMs: [0, 0],
    }),
  };
}

const check = (token = "token") => ({
  token,
  remoteIp: "203.0.113.9",
  action: "enquiry",
  hostAllowed: (hostname: string) =>
    Promise.resolve(hostname === "school.example.net"),
});

const solved = {
  success: true,
  action: "enquiry",
  hostname: "school.example.net",
};

describe("Turnstile", () => {
  it("passes a token Cloudflare solved for this action on the school's host", async () => {
    const { asked, turnstile } = cloudflare(solved);
    expect(await turnstile.verify(check())).toBe(true);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(asked[0]?.body).toMatchObject({
      secret: "secret",
      response: "token",
      remoteip: "203.0.113.9",
    });
  });

  it("refuses an empty or oversized token without asking", async () => {
    const { asked, turnstile } = cloudflare(solved);
    expect(await turnstile.verify(check(""))).toBe(false);
    expect(await turnstile.verify(check("x".repeat(2049)))).toBe(false);
    expect(asked).toHaveLength(0);
  });

  it("refuses what Cloudflare refuses, a token for another form, and one solved elsewhere", async () => {
    const { turnstile } = cloudflare(
      { success: false, "error-codes": ["timeout-or-duplicate"] },
      { ...solved, action: "signup" },
      { ...solved, hostname: "elsewhere.example.org" },
    );
    expect(await turnstile.verify(check())).toBe(false);
    expect(await turnstile.verify(check())).toBe(false);
    expect(await turnstile.verify(check())).toBe(false);
  });

  it("retries a failure on Cloudflare's side under one idempotency key, then refuses", async () => {
    const recovered = cloudflare(
      "down",
      { success: false, "error-codes": ["internal-error"] },
      solved,
    );
    expect(await recovered.turnstile.verify(check())).toBe(true);
    const keys = new Set(
      recovered.asked.map((request) => request.body.idempotency_key),
    );
    expect(recovered.asked).toHaveLength(3);
    expect(keys.size).toBe(1);

    const gone = cloudflare("down", 500, "down");
    expect(await gone.turnstile.verify(check())).toBe(false);
    expect(gone.asked).toHaveLength(3);
  });

  it("is set up by both keys or neither", () => {
    expect(turnstileFrom({})).toBeNull();
    expect(
      turnstileFrom({ TURNSTILE_SITE_KEY: "a", TURNSTILE_SECRET_KEY: "b" })
        ?.siteKey,
    ).toBe("a");
    expect(() => turnstileFrom({ TURNSTILE_SITE_KEY: "a" })).toThrow(
      "TURNSTILE_SITE_KEY",
    );
  });
});
