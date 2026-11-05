import type { RouterClient } from "@orpc/server";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { describe, expect, test } from "bun:test";

import type { AppRouter } from "../src/router";

import { createTurnstile } from "../src/core/turnstile";
import { client, DOMAINS, handlerWith, rejection, seeded } from "./harness";

const request = (overrides: Record<string, unknown> = {}) => ({
  locale: "en" as const,
  name: "Salama Ashoush",
  email: "salama@example.com",
  school: "Nile Valley School",
  role: "leader" as const,
  size: "200_1000" as const,
  phone: "+20 100 000 0000",
  message: "We would like to see the gradebook.",
  website: "",
  elapsed: 8000,
  ...overrides,
});

const toInbox = () =>
  seeded().mail.sent.filter((row) => row.to === "sales@example.com");

describe("demonstration requests", () => {
  test("a request reaches the product's inbox with what was asked", async () => {
    const before = toInbox().length;
    expect(
      await client("", undefined, "en", {
        "x-forwarded-for": "198.51.100.7",
      }).product.requestDemo(request()),
    ).toEqual({ received: true });
    const [sent] = toInbox().slice(before);
    expect(sent?.subject).toBe("Demo request: Nile Valley School");
    expect(sent?.text).toContain("Email: salama@example.com");
    expect(sent?.text).toContain("Role: School leader");
    expect(sent?.text).toContain("Students: 200 to 1,000");
    expect(sent?.text).toContain("We would like to see the gradebook.");
  });

  test("a form a script filled, or sent faster than a person types, is answered and dropped", async () => {
    const before = toInbox().length;
    const product = client("").product;
    expect(
      await product.requestDemo(request({ website: "https://spam.example" })),
    ).toEqual({ received: true });
    expect(await product.requestDemo(request({ elapsed: 400 }))).toEqual({
      received: true,
    });
    expect(toInbox().length).toBe(before);
  });

  test("one network is held to a few requests an hour", async () => {
    const product = client("", undefined, "en", {
      "x-forwarded-for": "203.0.113.50",
    }).product;
    let refused: unknown = null;
    for (let attempt = 0; attempt < 4 && !refused; attempt += 1)
      refused = await product.requestDemo(request()).then(
        () => null,
        (error: unknown) => error,
      );
    expect(refused).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "product.too_many",
    });
  });

  test("an address that is not one is refused", async () => {
    expect(
      await rejection(
        client("").product.requestDemo(request({ email: "not an address" })),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("the demonstration form's guard", () => {
  test("is the enquiry form's: where Turnstile is set up, its answer for this form on the bare domain decides", async () => {
    const answers = new Map<string, Record<string, unknown>>([
      ["good", { success: true, action: "demo", hostname: DOMAINS.portal }],
      [
        "sign-in",
        { success: true, action: "sign_in", hostname: DOMAINS.portal },
      ],
      [
        "elsewhere",
        { success: true, action: "demo", hostname: "evil.example.org" },
      ],
    ]);
    const turnstile = createTurnstile({
      siteKey: "site-key",
      secretKey: "secret-key",
      retryDelaysMs: [],
      fetch: (async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(
          typeof init?.body === "string" ? init.body : "{}",
        ) as Record<string, unknown>;
        return Response.json(
          answers.get(String(body.response)) ?? { success: false },
        );
      }) as typeof fetch,
    });
    const handler = handlerWith({ turnstile });
    const api: RouterClient<AppRouter> = createORPCClient(
      new RPCLink({
        url: "http://api.test/rpc",
        headers: () => ({ "x-forwarded-for": "198.18.0.77" }),
        fetch: (sent, init) => handler(new Request(sent, init)),
      }),
    );
    const product = api.product;
    const before = toInbox().length;
    for (const human of [undefined, "sign-in", "elsewhere"])
      expect(
        await rejection(product.requestDemo(request({ human }))),
      ).toMatchObject({ message: "site.challenge" });
    // A person who passed the challenge is not dropped for a quick fill.
    expect(
      await product.requestDemo(request({ human: "good", elapsed: 400 })),
    ).toEqual({ received: true });
    expect(toInbox().length).toBe(before + 1);
  });
});
