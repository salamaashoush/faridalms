import * as v from "valibot";

/**
 * What the API vouches for when it lets someone open a document for live
 * editing: which tenant and document, who, and whether they may write. The
 * collaboration server trusts nothing else a client sends. A `presence`
 * room is no document: `documentId` names a conversation, nothing is
 * stored, and those in it only say whether they are writing a reply.
 */
const documentTicketSchema = v.object({
  tenantId: v.pipe(v.string(), v.uuid()),
  documentId: v.pipe(v.string(), v.uuid()),
  userId: v.pipe(v.string(), v.uuid()),
  access: v.picklist(["read", "write"]),
  expiresAt: v.pipe(v.number(), v.integer()),
  room: v.optional(v.picklist(["document", "presence"]), "document"),
});
export type DocumentTicket = v.InferOutput<typeof documentTicketSchema>;

/**
 * What the API vouches for when it lets someone hear a lesson's teacher
 * move the class live: which tenant and lesson, and who. It only listens,
 * so it carries no access to choose.
 */
const pacingTicketSchema = v.object({
  kind: v.literal("pacing"),
  tenantId: v.pipe(v.string(), v.uuid()),
  lessonId: v.pipe(v.string(), v.uuid()),
  userId: v.pipe(v.string(), v.uuid()),
  expiresAt: v.pipe(v.number(), v.integer()),
});
export type PacingTicket = v.InferOutput<typeof pacingTicketSchema>;

export const ticketSchema = v.union([pacingTicketSchema, documentTicketSchema]);
export type Ticket = DocumentTicket | PacingTicket;
export type TicketInput = v.InferInput<typeof ticketSchema>;

/** How long a ticket stays good for opening a connection. */
export const TICKET_TTL_SECONDS = 120;

export const isPacing = (ticket: Ticket): ticket is PacingTicket =>
  "kind" in ticket;

export const roomOf = (
  ticket:
    | (Pick<DocumentTicket, "tenantId" | "documentId"> & {
        room?: DocumentTicket["room"];
      })
    | Pick<PacingTicket, "kind" | "tenantId" | "lessonId">,
) =>
  "lessonId" in ticket
    ? pacingRoom(ticket.tenantId, ticket.lessonId)
    : ticket.room === "presence"
      ? `${ticket.tenantId}:presence:${ticket.documentId}`
      : `${ticket.tenantId}:${ticket.documentId}`;

/** The room a lesson's students listen in for its teacher moving the class. */
export const pacingRoom = (tenantId: string, lessonId: string) =>
  `${tenantId}:pacing:${lessonId}`;

/** What the room hears when a lesson's pacing changes: ask again, nothing more. */
export const PACING_SIGNAL = "pacing";

/** How long a signal stays good, so one caught on the way cannot be sent much later. */
export const SIGNAL_TTL_SECONDS = 30;

const signalSchema = v.object({
  room: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  expiresAt: v.pipe(v.number(), v.integer()),
});
export type Signal = v.InferOutput<typeof signalSchema>;

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
 * A signing key, derived from the cell secret under its own label so a
 * ticket key can never double as a signal key, or any other key taken from
 * that secret.
 */
async function derivedKey(
  cellSecret: Uint8Array<ArrayBuffer>,
  label: "collaboration-ticket" | "collaboration-signal",
) {
  const root = await crypto.subtle.importKey(
    "raw",
    cellSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = await crypto.subtle.sign("HMAC", root, encoder.encode(label));
  return crypto.subtle.importKey(
    "raw",
    derived,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(value: unknown, key: CryptoKey): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

async function verify<T extends { expiresAt: number }>(
  token: string,
  key: Promise<CryptoKey>,
  schema: v.GenericSchema<unknown, T>,
  now: number,
): Promise<T | null> {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await key,
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
  const result = v.safeParse(schema, parsed);
  if (!result.success) return null;
  return result.output.expiresAt * 1000 > now ? result.output : null;
}

export async function signTicket(
  ticket: TicketInput,
  cellSecret: Uint8Array<ArrayBuffer>,
): Promise<string> {
  return sign(ticket, await derivedKey(cellSecret, "collaboration-ticket"));
}

/** The ticket a token carries, or null when it is forged, malformed or expired. */
export function verifyTicket(
  token: string,
  cellSecret: Uint8Array<ArrayBuffer>,
  now = Date.now(),
): Promise<Ticket | null> {
  return verify(
    token,
    derivedKey(cellSecret, "collaboration-ticket"),
    ticketSchema,
    now,
  );
}

/** A signal for the collaboration server to pass to a room, signed by the API. */
export async function signSignal(
  signal: Signal,
  cellSecret: Uint8Array<ArrayBuffer>,
): Promise<string> {
  return sign(signal, await derivedKey(cellSecret, "collaboration-signal"));
}

/** The signal a token carries, or null when it is forged, malformed or expired. */
export function verifySignal(
  token: string,
  cellSecret: Uint8Array<ArrayBuffer>,
  now = Date.now(),
): Promise<Signal | null> {
  return verify(
    token,
    derivedKey(cellSecret, "collaboration-signal"),
    signalSchema,
    now,
  );
}
