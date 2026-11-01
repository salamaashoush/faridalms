import { createHash } from "node:crypto";

import type { OutboundMessage, Provider } from "./providers";

import { ProviderError } from "./providers";

const ENDPOINT = "https://api.resend.com/emails";
/**
 * The longest a send waits for the rate window to reopen. Resend's window is
 * a second, so a longer wait is a quota running out, which the delivery
 * worker's backoff waits out better than a request holding its caller.
 */
const MAX_WAIT_MS = 5_000;

const seconds = (value: string | null): number | null => {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1000 : null;
};

/**
 * Email through Resend's API. The rate limit is the team's, shared with
 * every other key and process that sends for it, so the pace comes from
 * the `ratelimit-remaining` and `ratelimit-reset` each answer carries rather
 * than a constant here; a 429 waits out its `retry-after`.
 *
 * Every send carries an idempotency key derived from the message and its
 * reference, so a retry after a lost answer is not sent twice, while two
 * deliveries that happen to read alike are still two emails.
 */
export class ResendProvider implements Provider {
  private remaining: number | null = null;
  private resetAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly sleep: (ms: number) => Promise<unknown> = Bun.sleep,
    private readonly clock: () => number = Date.now,
  ) {}

  async send(message: OutboundMessage) {
    const body = JSON.stringify({
      from: this.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    });
    const idempotencyKey = `farida/${createHash("sha256")
      .update(message.reference ?? "")
      .update("\n")
      .update(body)
      .digest("hex")}`;
    return this.attempt(body, idempotencyKey, true);
  }

  private async attempt(
    body: string,
    idempotencyKey: string,
    mayRetry: boolean,
  ): Promise<{ receipt: string | null }> {
    await this.paced();
    const response = await this.fetcher(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "user-agent": "faridalms-api",
        "idempotency-key": idempotencyKey,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    this.learn(response);
    if (response.ok) {
      const sent = (await response.json().catch(() => null)) as {
        id?: unknown;
      } | null;
      return { receipt: typeof sent?.id === "string" ? sent.id : null };
    }
    const failure = await describe(response);
    const retryable =
      response.status === 429 ||
      failure.name === "concurrent_idempotent_requests";
    const wait = seconds(response.headers.get("retry-after")) ?? 1_000;
    if (mayRetry && retryable && wait <= MAX_WAIT_MS) {
      await this.sleep(wait);
      return this.attempt(body, idempotencyKey, false);
    }
    // Only the message can be at fault in a 422; a bad key, an unverified
    // sender or a spent quota is the platform's to fix, and the delivery
    // worker retries those with backoff until it is fixed.
    throw new ProviderError(
      `${response.status} ${failure.name}: ${failure.message}`,
      response.status === 422,
    );
  }

  private learn(response: Response) {
    const now = this.clock();
    if (response.status === 429) {
      this.remaining = 0;
      this.resetAt =
        now + (seconds(response.headers.get("retry-after")) ?? 1_000);
      return;
    }
    const remaining = Number(response.headers.get("ratelimit-remaining"));
    const reset = seconds(response.headers.get("ratelimit-reset"));
    if (
      response.headers.has("ratelimit-remaining") &&
      Number.isFinite(remaining)
    )
      this.remaining = remaining;
    if (reset !== null) this.resetAt = now + reset;
  }

  private async paced() {
    if (this.remaining === null || this.remaining > 0) return;
    const wait = this.resetAt - this.clock();
    if (wait > MAX_WAIT_MS)
      throw new ProviderError(
        `rate limited for another ${Math.ceil(wait / 1000)}s`,
      );
    if (wait > 0) await this.sleep(wait);
    this.remaining = null;
  }
}

async function describe(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { name?: unknown; message?: unknown };
    return {
      name: typeof parsed.name === "string" ? parsed.name : "error",
      message:
        typeof parsed.message === "string"
          ? parsed.message.slice(0, 300)
          : text.slice(0, 300),
    };
  } catch {
    return { name: "error", message: text.slice(0, 300) };
  }
}
