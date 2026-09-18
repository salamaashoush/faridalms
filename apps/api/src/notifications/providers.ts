export interface OutboundMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Provider {
  send(message: OutboundMessage): Promise<{ receipt: string | null }>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly permanent = false,
  ) {
    super(message);
  }
}

/**
 * Posts JSON to a configured HTTP endpoint. Transactional email and SMS
 * gateways accept this shape or a thin variation of it; the endpoint decides
 * the vendor, so no vendor SDK enters the API.
 */
export class HttpProvider implements Provider {
  constructor(
    private readonly url: string,
    private readonly token: string | undefined,
  ) {}

  async send(message: OutboundMessage) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new ProviderError(
        `${response.status} ${detail}`,
        response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429,
      );
    }
    const body = (await response.json().catch(() => null)) as {
      id?: string;
      receipt?: string;
    } | null;
    return { receipt: body?.id ?? body?.receipt ?? null };
  }
}

/**
 * Records sends in memory for tests. An address containing `fail-once` fails
 * the first attempt of each message so the retry path is exercised;
 * `fail-always` never succeeds; `reject` fails permanently.
 */
export class MemoryProvider implements Provider {
  readonly sent: OutboundMessage[] = [];
  private readonly failures = new Map<string, number>();

  send(message: OutboundMessage) {
    const key = `${message.to}\n${message.subject}`;
    const seen = this.failures.get(key) ?? 0;
    this.failures.set(key, seen + 1);
    if (message.to.includes("reject"))
      throw new ProviderError("rejected by provider", true);
    if (message.to.includes("fail-always"))
      throw new ProviderError("provider unavailable");
    if (message.to.includes("fail-once") && seen === 0)
      throw new ProviderError("temporary failure");
    this.sent.push(message);
    return Promise.resolve({ receipt: `memory-${this.sent.length}` });
  }
}

export function createProvider(
  url: string | undefined,
  token: string | undefined,
): Provider | null {
  if (!url) return null;
  if (url === "memory:") return new MemoryProvider();
  return new HttpProvider(url, token);
}
