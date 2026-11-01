import { createHmac, timingSafeEqual } from "node:crypto";

/** A received email as Resend's receiving API returns it, in the shape the inbound route reads. */
export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string | null;
  html: string | null;
  /** Header names in lower case. */
  headers: Record<string, string>;
  messageId: string | null;
  authentication: { spf?: string; dkim?: string; dmarc?: string } | null;
  attachments: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
  }[];
}

/** Where received mail is read from; the inbound route needs nothing else of the provider. */
export interface Inbox {
  email(id: string): Promise<ReceivedEmail | null>;
  /** An attachment's bytes, or null when it is gone or larger than `maxBytes`. */
  attachment(
    emailId: string,
    attachmentId: string,
    maxBytes: number,
  ): Promise<Uint8Array | null>;
}

const API = "https://api.resend.com";

/** Where Resend serves received mail's attachments from; nothing else is fetched. */
const DOWNLOAD_HOST = /(^|\.)resend\.(com|app)$/;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

/**
 * Resend's receiving API: the webhook names an email, and its body,
 * headers, checks and attachments are read from here with the API key.
 * Download links last an hour, so an attachment is fetched as the webhook
 * is handled, by the size it declares and no further.
 */
export class ResendInbox implements Inbox {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private get(path: string) {
    return this.fetcher(`${API}${path}`, {
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "user-agent": "faridalms-api",
      },
      signal: AbortSignal.timeout(15_000),
    });
  }

  async email(id: string): Promise<ReceivedEmail | null> {
    const response = await this.get(
      `/emails/receiving/${encodeURIComponent(id)}`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`resend receiving ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    const headers: Record<string, string> = {};
    if (body.headers && typeof body.headers === "object")
      for (const [name, value] of Object.entries(body.headers))
        headers[name.toLowerCase()] = Array.isArray(value)
          ? value.map(String).join(", ")
          : String(value);
    const checks = body.authentication as Record<string, unknown> | null;
    return {
      id: text(body.id) || id,
      from: text(body.from),
      to: list(body.to),
      cc: list(body.cc),
      subject: text(body.subject),
      text: typeof body.text === "string" ? body.text : null,
      html: typeof body.html === "string" ? body.html : null,
      headers,
      messageId: text(body.message_id) || null,
      authentication: checks
        ? {
            spf: text(checks.spf),
            dkim: text(checks.dkim),
            dmarc: text(checks.dmarc),
          }
        : null,
      attachments: (Array.isArray(body.attachments) ? body.attachments : [])
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object",
        )
        .map((item) => ({
          id: text(item.id),
          filename: text(item.filename) || "attachment",
          contentType: text(item.content_type) || "application/octet-stream",
          size: Number(item.size) || 0,
        })),
    };
  }

  async attachment(
    emailId: string,
    attachmentId: string,
    maxBytes: number,
  ): Promise<Uint8Array | null> {
    const response = await this.get(
      `/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: unknown };
    const found = (Array.isArray(body.data) ? body.data : []).find(
      (item): item is { download_url: string; size: number } =>
        Boolean(item) &&
        typeof item === "object" &&
        (item as { id?: unknown }).id === attachmentId &&
        typeof (item as { download_url?: unknown }).download_url === "string",
    );
    if (!found || found.size > maxBytes) return null;
    const url = new URL(found.download_url);
    if (url.protocol !== "https:" || !DOWNLOAD_HOST.test(url.hostname))
      return null;
    const download = await this.fetcher(url, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!download.ok || !download.body) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of download.body) {
      size += chunk.byteLength;
      if (size > maxBytes) return null;
      chunks.push(chunk);
    }
    return new Uint8Array(Buffer.concat(chunks));
  }
}

/** How far a webhook's timestamp may be from now before it is taken for a replay. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Whether a webhook came from Resend, which signs through Svix: an
 * HMAC-SHA256 of `<id>.<timestamp>.<raw body>` under the base64 secret after
 * its `whsec_` prefix, sent as space-separated `v1,<base64>` signatures.
 * The raw body is checked, before anything parses it.
 */
export function verifyWebhook(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now: Date;
}): boolean {
  if (!input.id || !input.timestamp || !input.signature) return false;
  const seconds = Number(input.timestamp);
  if (
    !Number.isInteger(seconds) ||
    Math.abs(input.now.getTime() / 1000 - seconds) > WEBHOOK_TOLERANCE_SECONDS
  )
    return false;
  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.body}`)
    .digest();
  return input.signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** A webhook's body signed as Resend signs it, for tests and local trials. */
export function signWebhook(input: {
  secret: string;
  id: string;
  timestamp: number;
  body: string;
}): string {
  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.body}`)
    .digest("base64")}`;
}
