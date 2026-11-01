import { REPLY_TOKEN_LENGTH } from "@faridalms/domain/email-replies";
import { createHash } from "node:crypto";

import { attemptKey } from "../core/session";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * The reply token of one outside contact's place in one conversation: an
 * HMAC of the member row under the tenant's key from the cell's secret,
 * so nothing secret is stored and nobody without the secret can make one.
 * Lower-case base32, since mail systems may change an address's case.
 */
export function replyToken(
  cellSecret: Uint8Array<ArrayBuffer>,
  tenantId: string,
  memberId: string,
): string {
  return base32(attemptKey(cellSecret, tenantId, `reply:${memberId}`)).slice(
    0,
    REPLY_TOKEN_LENGTH,
  );
}

/** What the conversation keeps of a token to find it again: its SHA-256. */
export const replyKey = (token: string): Uint8Array =>
  createHash("sha256").update(token).digest();
