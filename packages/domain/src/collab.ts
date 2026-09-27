import * as v from "valibot";

/**
 * What the API vouches for when it lets someone open a document for live
 * editing: which tenant and document, who, and whether they may write. The
 * collaboration server trusts nothing else a client sends.
 */
export const ticketSchema = v.object({
  tenantId: v.pipe(v.string(), v.uuid()),
  documentId: v.pipe(v.string(), v.uuid()),
  userId: v.pipe(v.string(), v.uuid()),
  access: v.picklist(["read", "write"]),
  expiresAt: v.pipe(v.number(), v.integer()),
});
export type Ticket = v.InferOutput<typeof ticketSchema>;

/** How long a ticket stays good for opening a connection. */
export const TICKET_TTL_SECONDS = 120;

export const roomOf = (ticket: Pick<Ticket, "tenantId" | "documentId">) =>
  `${ticket.tenantId}:${ticket.documentId}`;

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * The signing key, derived from the cell secret under its own label so a
 * ticket key can never double as any other key taken from that secret.
 */
async function ticketKey(cellSecret: Uint8Array<ArrayBuffer>) {
  const root = await crypto.subtle.importKey(
    "raw",
    cellSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = await crypto.subtle.sign(
    "HMAC",
    root,
    encoder.encode("collaboration-ticket"),
  );
  return crypto.subtle.importKey(
    "raw",
    derived,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signTicket(
  ticket: Ticket,
  cellSecret: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(ticket)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await ticketKey(cellSecret),
    encoder.encode(body),
  );
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

/** The ticket a token carries, or null when it is forged, malformed or expired. */
export async function verifyTicket(
  token: string,
  cellSecret: Uint8Array<ArrayBuffer>,
  now = Date.now(),
): Promise<Ticket | null> {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await ticketKey(cellSecret),
      fromBase64url(signature),
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!valid) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
  } catch {
    return null;
  }
  const result = v.safeParse(ticketSchema, parsed);
  if (!result.success) return null;
  return result.output.expiresAt * 1000 > now ? result.output : null;
}
