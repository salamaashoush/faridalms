import { describe, expect, it } from "vitest";

import { ProviderError } from "./providers";
import { ResendProvider } from "./resend";

const message = {
  to: "salama@example.com",
  subject: "Choose a password",
  text: "Open the link to choose one.",
};

function resend(
  answers: Array<{ status: number; headers?: object; body?: object }>,
) {
  const requests: Request[] = [];
  const slept: number[] = [];
  let now = 1_000_000;
  const fetcher = (async (url: string, init: RequestInit) => {
    requests.push(new Request(url, init));
    const answer = answers.shift() ?? { status: 200, body: { id: "next" } };
    return new Response(JSON.stringify(answer.body ?? {}), {
      status: answer.status,
      headers: { ...answer.headers },
    });
  }) as typeof fetch;
  const provider = new ResendProvider(
    "re_test",
    "Farida <no-reply@mail.example.com>",
    {
      fetcher,
      sleep: async (ms) => {
        slept.push(ms);
        now += ms;
      },
      clock: () => now,
    },
  );
  return { provider, requests, slept };
}

describe("ResendProvider", () => {
  it("sends the message from the platform's sender and keeps Resend's id", async () => {
    const { provider, requests } = resend([
      { status: 200, body: { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" } },
    ]);
    expect(await provider.send(message)).toEqual({
      receipt: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794",
    });
    const [request] = requests;
    expect(request?.url).toBe("https://api.resend.com/emails");
    expect(request?.headers.get("authorization")).toBe("Bearer re_test");
    expect(request?.headers.get("user-agent")).toBe("faridalms-api");
    expect(await request?.json()).toEqual({
      from: "Farida <no-reply@mail.example.com>",
      to: ["salama@example.com"],
      subject: "Choose a password",
      text: "Open the link to choose one.",
    });
  });

  it("sends the tags Resend hands back with a bounce or complaint", async () => {
    const { provider, requests } = resend([{ status: 200, body: { id: "a" } }]);
    await provider.send({
      ...message,
      tags: { tenant: "0195f1c2-7d3a-7b4e-9a10-2f6c8d4e5a01" },
    });
    const [request] = requests;
    if (!request) throw new Error("nothing was sent");
    expect(((await request.json()) as { tags?: unknown }).tags).toEqual([
      { name: "tenant", value: "0195f1c2-7d3a-7b4e-9a10-2f6c8d4e5a01" },
    ]);
  });

  it("sends a retry under the same idempotency key, and another delivery under its own", async () => {
    const { provider, requests } = resend([]);
    await provider.send({ ...message, reference: "a" });
    await provider.send({ ...message, reference: "a" });
    await provider.send({ ...message, reference: "b" });
    const keys = requests.map((request) =>
      request.headers.get("idempotency-key"),
    );
    expect(keys[0]).toMatch(/^farida\/[0-9a-f]{64}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("waits for the window Resend says is spent to reopen", async () => {
    const { provider, slept } = resend([
      {
        status: 200,
        headers: { "ratelimit-remaining": "0", "ratelimit-reset": "1" },
        body: { id: "one" },
      },
    ]);
    await provider.send(message);
    expect(slept).toEqual([]);
    await provider.send(message);
    expect(slept).toEqual([1000]);
  });

  it("sends again once after a short retry-after", async () => {
    const { provider, requests, slept } = resend([
      {
        status: 429,
        headers: { "retry-after": "2" },
        body: { name: "rate_limit_exceeded" },
      },
      { status: 200, body: { id: "two" } },
    ]);
    expect(await provider.send(message)).toEqual({ receipt: "two" });
    expect(slept).toEqual([2000]);
    expect(requests).toHaveLength(2);
  });

  it("leaves a spent quota to the delivery worker, without asking Resend again meanwhile", async () => {
    const { provider, requests } = resend([
      {
        status: 429,
        headers: { "retry-after": "3600" },
        body: {
          name: "daily_quota_exceeded",
          message: "You have reached your daily email sending quota.",
        },
      },
    ]);
    const first = await provider.send(message).catch((error: unknown) => error);
    expect(first).toBeInstanceOf(ProviderError);
    expect(first).toMatchObject({ permanent: false });
    expect(String(first)).toContain("daily_quota_exceeded");
    await expect(provider.send(message)).rejects.toThrow(/rate limited/);
    expect(requests).toHaveLength(1);
  });

  it("gives up only on a message Resend cannot accept", async () => {
    const invalid = resend([
      {
        status: 422,
        body: { name: "invalid_parameter", message: "Invalid `to` field." },
      },
    ]);
    await expect(invalid.provider.send(message)).rejects.toMatchObject({
      permanent: true,
    });
    const unverified = resend([
      {
        status: 403,
        body: {
          name: "validation_error",
          message: "The mail.example.com domain is not verified.",
        },
      },
    ]);
    await expect(unverified.provider.send(message)).rejects.toMatchObject({
      permanent: false,
    });
  });
});
