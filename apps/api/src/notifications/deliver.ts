import type { Cell, CellTransaction } from "@faridalms/database/context";
import type {
  DueConversationMail,
  DueDelivery,
} from "@faridalms/database/stores/notifications";
import type { ContentDocument } from "@faridalms/domain/content";

import { keepReplyKey } from "@faridalms/database/stores/messages";
import {
  claimConversationMail,
  claimDue,
  settleDeliveries,
} from "@faridalms/database/stores/notifications";
import { replyAddress } from "@faridalms/domain/email-replies";
import { retryDelayMs } from "@faridalms/domain/notifications";

import type { FileStore } from "../files/store";
import type { OutboundMessage, Provider } from "./providers";

import { replyKey, replyToken } from "../messages/reply";
import { ProviderError } from "./providers";
import { conversationMessage, render } from "./templates";

/** What a conversation's email needs beyond a provider: where replies come back, and the files it carries. */
export interface ConversationMail {
  /** The domain replies are received at; null sends them to the school's own address. */
  replyDomain: string | null;
  cellSecret: Uint8Array<ArrayBuffer>;
  files: FileStore;
}

export interface Gateways {
  email: Provider | null;
  sms: Provider | null;
  conversations?: ConversationMail;
}

/** The most a conversation's email carries attached; larger files are named instead. */
export const ATTACHED_BYTES = 20 * 1024 * 1024;

function groups(rows: readonly DueDelivery[]): DueDelivery[][] {
  const out: DueDelivery[][] = [];
  const digests = new Map<string, DueDelivery[]>();
  for (const row of rows) {
    if (!row.digest) {
      out.push([row]);
      continue;
    }
    const key = `${row.userId}:${row.channel}:${row.address}`;
    const group = digests.get(key);
    if (group) group.push(row);
    else {
      const fresh = [row];
      digests.set(key, fresh);
      out.push(fresh);
    }
  }
  return out;
}

/** Sends one message for some deliveries and records how it went, retrying a failure later. */
async function sendFor(
  tx: CellTransaction,
  input: {
    tenantId: string;
    now: Date;
    provider: Provider;
    ids: { id: string; createdAt: string }[];
    attempts: number;
    message: OutboundMessage;
  },
): Promise<boolean> {
  try {
    const result = await input.provider.send(input.message);
    await settleDeliveries(tx, {
      tenantId: input.tenantId,
      ids: input.ids,
      outcome: { state: "sent", receipt: result.receipt },
    });
    return true;
  } catch (error) {
    const permanent = error instanceof ProviderError && error.permanent;
    const delay = retryDelayMs(input.attempts);
    await settleDeliveries(tx, {
      tenantId: input.tenantId,
      ids: input.ids,
      outcome: {
        state: "failed",
        error: error instanceof Error ? error.message : String(error),
        giveUp: permanent || delay === null,
        retryAt: delay === null ? null : new Date(input.now.getTime() + delay),
      },
    });
    return false;
  }
}

/** Reads a file whole, for an email that carries it. */
async function bytesOf(files: FileStore, key: string) {
  const stream = await files.open(key);
  if (!stream) return null;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * One message of a conversation as the email to an outside contact. Its
 * reply address carries the contact's token for the conversation, kept as
 * a digest the first time; without a receiving domain the family answers
 * the school's own address. Files go attached up to a size, the rest named.
 */
async function conversationEmail(
  tx: CellTransaction,
  tenantId: string,
  row: DueConversationMail,
  mail: ConversationMail | undefined,
): Promise<OutboundMessage> {
  const school =
    (row.locale === "ar" ? row.schoolNameAr : row.schoolNameEn) ??
    row.schoolNameEn ??
    row.schoolNameAr ??
    "";
  let replyTo = row.schoolEmail ?? undefined;
  if (mail?.replyDomain && row.memberId) {
    const token = replyToken(mail.cellSecret, tenantId, row.memberId);
    await keepReplyKey(tx, {
      tenantId,
      memberId: row.memberId,
      key: replyKey(token),
    });
    replyTo = replyAddress(tenantId, token, mail.replyDomain);
  }
  const attachments: { filename: string; content: Uint8Array }[] = [];
  const keptBack: string[] = [];
  let carried = 0;
  for (const file of row.files) {
    const bytes =
      mail && carried + file.sizeBytes <= ATTACHED_BYTES
        ? await bytesOf(mail.files, file.storageKey)
        : null;
    if (bytes) {
      carried += bytes.byteLength;
      attachments.push({ filename: file.name, content: bytes });
    } else keptBack.push(file.name);
  }
  const rendered = conversationMessage({
    locale: row.locale,
    school,
    subject: row.subject ?? school,
    text: row.body,
    content: row.content as unknown as ContentDocument | null,
    repliesReturn: Boolean(mail?.replyDomain && row.memberId),
    keptBack,
  });
  return {
    to: row.address,
    ...rendered,
    fromName: school,
    reference: row.id,
    ...(replyTo ? { replyTo } : {}),
    ...(row.inReplyTo ? { inReplyTo: row.inReplyTo } : {}),
    ...(attachments.length ? { attachments } : {}),
  };
}

/**
 * One pass over a tenant's due deliveries as the worker. Rows are claimed with
 * a lock inside the unit, so two passes never send the same one; a person's
 * digest items leave as one message; a conversation's message to an outside
 * contact leaves whole; a failed send is retried with backoff until the
 * attempts run out. What is due is judged by the database's clock, the one
 * deliveries were made due by.
 */
export async function deliverTenant(
  cell: Cell,
  gateways: Gateways,
  tenantId: string,
  limit = 200,
): Promise<{ sent: number; failed: number }> {
  return cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "write",
    async (tx, now) => {
      const due = await claimDue(tx, { tenantId, now, limit });
      let sent = 0;
      let failed = 0;
      for (const group of groups(due)) {
        const [head] = group;
        if (!head) continue;
        const provider = gateways[head.channel];
        const ids = group.map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
        }));
        if (!provider) {
          await settleDeliveries(tx, {
            tenantId,
            ids,
            outcome: { state: "skipped", reason: "no_provider" },
          });
          continue;
        }
        const school =
          (head.locale === "ar" ? head.schoolNameAr : head.schoolNameEn) ??
          head.schoolNameEn ??
          "";
        const message = render({
          locale: head.locale,
          channel: head.channel,
          school,
          items: group.map((row) => ({ kind: row.kind, params: row.params })),
        });
        if (
          await sendFor(tx, {
            tenantId,
            now,
            provider,
            ids,
            attempts: head.attempts,
            message: {
              to: head.address,
              ...message,
              reference: group.map((row) => row.id).join(","),
            },
          })
        )
          sent += group.length;
        else failed += group.length;
      }
      for (const row of await claimConversationMail(tx, {
        tenantId,
        now,
        limit,
      })) {
        const ids = [{ id: row.id, createdAt: row.createdAt }];
        if (!gateways.email) {
          await settleDeliveries(tx, {
            tenantId,
            ids,
            outcome: { state: "skipped", reason: "no_provider" },
          });
          continue;
        }
        if (
          await sendFor(tx, {
            tenantId,
            now,
            provider: gateways.email,
            ids,
            attempts: row.attempts,
            message: await conversationEmail(
              tx,
              tenantId,
              row,
              gateways.conversations,
            ),
          })
        )
          sent += 1;
        else failed += 1;
      }
      return { sent, failed };
    },
  );
}
