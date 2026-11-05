import type { StoredFile } from "@faridalms/database/stores/files";
import type { ReplyTarget } from "@faridalms/database/stores/messages";
import type { ContentDocument } from "@faridalms/domain/content";

import { mapDatabaseError } from "@faridalms/database/errors";
import {
  hostArrivedFiles,
  initiateFile,
  schoolStorage,
  settleFile,
} from "@faridalms/database/stores/files";
import {
  mailTaken,
  recentMail,
  replyTarget,
} from "@faridalms/database/stores/messages";
import {
  plainContent,
  withFileBlocks,
} from "@faridalms/domain/content-conversion";
import {
  automatedReason,
  domainOf,
  mailboxAddress,
  newContent,
  readReplyAddress,
  senderAuthenticated,
  textOfHtml,
} from "@faridalms/domain/email-replies";
import {
  attachable,
  MESSAGE_ATTACHMENT_BYTES,
  MESSAGE_ATTACHMENT_LIMIT,
  safeFilename,
} from "@faridalms/domain/file";
import { BASIC_ENTITLEMENTS, limitsOf } from "@faridalms/domain/plans";
import { schoolDate } from "@faridalms/domain/school";

import type { RequestContext } from "../core/context";
import type { Inbox } from "../notifications/resend-inbox";

import { schoolZone } from "../core/procedure";
import { takeChecked } from "../files/ingest";
import { fileKeys } from "../files/sealed";
import { verifyWebhook } from "../notifications/resend-inbox";
import { writeEntry } from "./conversations";
import { replyKey } from "./reply";

/** Where Resend posts the mail it received for the platform (platform foundation 7.1). */
export const INBOUND_PATH = "/callbacks/resend";

/** A webhook names the email; its body is fetched, so the request itself stays small. */
const MAX_WEBHOOK_BYTES = 256 * 1024;
/** Mail into one conversation in an hour past which more is dropped, kept or held alike. */
export const MAIL_PER_HOUR = 20;

/** Replies to conversations' email, received through Resend. */
export interface InboundMail {
  domain: string;
  webhookSecret: string;
  inbox: Inbox;
  /** The platform's sending domain, whose mail never enters a conversation. */
  senderDomain: string | null;
}

export type InboundOutcome =
  | "posted"
  | "held"
  | "ignored"
  | "unknown_address"
  | "unknown_token"
  | "duplicate"
  | "automated"
  | "loop"
  | "flood"
  | "empty"
  | "gone";

interface Skipped {
  name: string;
  reason: "too_large" | "too_many" | "not_allowed" | "no_room" | "rejected";
}

/**
 * Takes one received email into the conversation its reply address names.
 * Nothing it says can make it more than the outside contact's message: it
 * is never posted as a person with an account, whatever its `From` claims.
 * It is posted only when it comes from the contact's own address and passed
 * its domain's checks; otherwise it is held as an internal entry for the
 * team to read. Mail a machine sent, a flood, and mail of our own sending
 * are dropped, and so is anything sent twice.
 */
async function takeMail(
  context: RequestContext,
  inbound: InboundMail,
  emailId: string,
  addresses: readonly string[],
): Promise<InboundOutcome> {
  const routed = addresses
    .map((address) => mailboxAddress(address) ?? address)
    .map((address) => readReplyAddress(address, inbound.domain))
    .find((found) => found !== null);
  if (!routed) return "unknown_address";
  const tenants = await context.directory.tenantsOfCell(context.cellId);
  if (!tenants.includes(routed.tenantId)) return "unknown_address";
  const email = await inbound.inbox.email(emailId);
  if (!email) return "gone";
  const from = mailboxAddress(email.from) ?? "";
  const work = {
    tenantId: routed.tenantId,
    requestId: context.requestId,
    actor: { kind: "system" as const },
  };

  type Prepared =
    | { outcome: InboundOutcome }
    | {
        outcome: null;
        target: ReplyTarget;
        trusted: boolean;
        reason: "sender" | "unauthenticated";
        text: string;
        files: { file: StoredFile; attachmentId: string }[];
        skipped: Skipped[];
      };
  const prepared: Prepared = await context.cell.withTenant(
    work,
    "write",
    async (tx) => {
      const target = await replyTarget(tx, {
        tenantId: routed.tenantId,
        key: replyKey(routed.token),
      });
      if (!target) return { outcome: "unknown_token" };
      if (await mailTaken(tx, { tenantId: routed.tenantId, emailId }))
        return { outcome: "duplicate" };
      if (automatedReason(email.headers, from)) return { outcome: "automated" };
      const fromDomain = domainOf(from);
      if (
        fromDomain === inbound.domain ||
        fromDomain.endsWith(`.${inbound.domain}`) ||
        (inbound.senderDomain !== null && fromDomain === inbound.senderDomain)
      )
        return { outcome: "loop" };
      if (
        (await recentMail(tx, {
          tenantId: routed.tenantId,
          threadId: target.threadId,
          since: new Date(Date.now() - 60 * 60 * 1000),
        })) >= MAIL_PER_HOUR
      )
        return { outcome: "flood" };
      const sender = from !== "" && from === target.email;
      const trusted = sender && senderAuthenticated(email.authentication);
      const text = newContent(email.text ?? textOfHtml(email.html ?? ""));
      const files: { file: StoredFile; attachmentId: string }[] = [];
      const skipped: Skipped[] = [];
      if (trusted) {
        const school = (
          await context.directory.schoolsOfTenant(routed.tenantId)
        ).find((row) => row.schoolId === target.orgId);
        const pool = limitsOf(
          school?.entitlements ?? BASIC_ENTITLEMENTS,
        ).poolBytes;
        let used = (await schoolStorage(tx, routed.tenantId, target.orgId))
          .usedBytes;
        for (const attachment of email.attachments) {
          const name = safeFilename(attachment.filename);
          if (!attachable(name)) skipped.push({ name, reason: "not_allowed" });
          else if (files.length >= MESSAGE_ATTACHMENT_LIMIT)
            skipped.push({ name, reason: "too_many" });
          else if (
            attachment.size <= 0 ||
            attachment.size >
              Math.min(MESSAGE_ATTACHMENT_BYTES, context.maxUploadBytes)
          )
            skipped.push({ name, reason: "too_large" });
          else if (used + attachment.size > pool)
            skipped.push({ name, reason: "no_room" });
          else {
            used += attachment.size;
            files.push({
              attachmentId: attachment.id,
              file: await initiateFile(tx, {
                tenantId: routed.tenantId,
                userId: null,
                orgId: target.orgId,
                purpose: "message_attachment",
                name,
                mediaType: attachment.contentType,
                sizeBytes: attachment.size,
              }),
            });
          }
        }
      }
      return {
        outcome: null,
        target,
        trusted,
        reason: sender ? "unauthenticated" : "sender",
        text,
        files,
        skipped,
      };
    },
  );
  if (prepared.outcome !== null) return prepared.outcome;

  // The bytes are fetched and checked outside a transaction, as an upload's
  // are; a file that fails is named in the message instead of carried.
  const ready: StoredFile[] = [];
  const skipped = [...prepared.skipped];
  for (const { file, attachmentId } of prepared.files) {
    const bytes = await inbound.inbox.attachment(
      emailId,
      attachmentId,
      file.sizeBytes,
    );
    const checked = bytes
      ? await takeChecked(
          {
            files: context.files,
            scanner: context.scanner,
            keys: fileKeys(context),
            log: context.requestId,
          },
          routed.tenantId,
          file,
          new Blob([new Uint8Array(bytes)]).stream(),
          file.sizeBytes,
        )
      : ({ ok: false, reason: "size_mismatch" } as const);
    await context.cell.withWorker(work, "write", (tx) =>
      settleFile(tx, {
        tenantId: routed.tenantId,
        id: file.id,
        verdict: checked.ok
          ? {
              state: "ready",
              sha256: checked.sha256,
              scanEngine: context.scanner ? "clamd" : null,
              stream: context.mediaOrigin !== null,
              keyVersion: checked.keyVersion,
            }
          : { state: "rejected", reason: checked.reason },
      }),
    );
    if (checked.ok) ready.push(file);
    else skipped.push({ name: file.name, reason: "rejected" });
  }

  const { target } = prepared;
  if (prepared.trusted && !prepared.text && ready.length === 0) return "empty";
  try {
    await context.cell.withTenant(
      work,
      "write",
      async (tx, _lifecycle, now) => {
        const scope = {
          tx,
          tenantId: routed.tenantId,
          schoolId: target.orgId,
          actorUserId: null,
          now,
          channels: context.channels,
          today: schoolDate(await schoolZone(tx, target.orgId), now),
        };
        if (prepared.trusted) {
          const entryId = Bun.randomUUIDv7();
          const hosted = new Set(
            await hostArrivedFiles(tx, {
              tenantId: routed.tenantId,
              ids: ready.map((file) => file.id),
              host: { type: "message", id: entryId },
            }),
          );
          const carried = ready.filter((file) => hosted.has(file.id));
          const content: ContentDocument = withFileBlocks(
            prepared.text
              ? plainContent(prepared.text)
              : { root: { type: "root", version: 1, children: [] } },
            carried,
          );
          await writeEntry(scope, {
            id: entryId,
            threadId: target.threadId,
            kind: "message",
            authorUserId: null,
            authorContactId: target.contactId,
            content,
            mediaIds: carried.map((file) => file.id),
            details: {
              emailId,
              ...(email.messageId ? { messageId: email.messageId } : {}),
              ...(skipped.length ? { skipped } : {}),
            },
          });
          return;
        }
        await writeEntry(scope, {
          threadId: target.threadId,
          kind: "held",
          authorUserId: null,
          content: plainContent(
            prepared.text || email.subject.slice(0, 200) || "-",
          ),
          details: {
            emailId,
            from: from.slice(0, 254),
            reason: prepared.reason,
            subject: email.subject.slice(0, 200),
          },
        });
      },
    );
  } catch (error) {
    // The same email delivered twice at once: the other delivery took it.
    if (mapDatabaseError(error)?.code === "messages.taken") return "duplicate";
    throw error;
  }
  return prepared.trusted ? "posted" : "held";
}

/**
 * Resend's webhook for received mail. It is answered 401 unless Resend
 * signed it, and 200 once handled, whatever became of the mail, so Resend
 * stops retrying; a failure on our side answers 500, and Resend tries
 * again later with the same email, which is then taken once.
 */
export async function handleInboundMail(
  request: Request,
  url: URL,
  context: RequestContext,
): Promise<Response | null> {
  if (url.pathname !== INBOUND_PATH) return null;
  const inbound = context.inbound;
  if (!inbound) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  if (request.method !== "POST")
    return Response.json({ code: "METHOD_NOT_ALLOWED" }, { status: 405 });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES)
    return Response.json({ code: "TOO_LARGE" }, { status: 413 });
  const body = await request.text();
  if (body.length > MAX_WEBHOOK_BYTES)
    return Response.json({ code: "TOO_LARGE" }, { status: 413 });
  if (
    !verifyWebhook({
      secret: inbound.webhookSecret,
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
      body,
      now: new Date(),
    })
  )
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  let event: { type?: unknown; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body) as typeof event;
  } catch {
    return Response.json({ code: "BAD_REQUEST" }, { status: 400 });
  }
  const data = event.data ?? {};
  const emailId = typeof data.email_id === "string" ? data.email_id : "";
  const outcome: InboundOutcome =
    event.type !== "email.received" || !emailId
      ? "ignored"
      : await takeMail(
          context,
          inbound,
          emailId,
          [data.to, data.cc, data.received_for].flatMap((value) =>
            Array.isArray(value)
              ? value.filter((item): item is string => typeof item === "string")
              : [],
          ),
        );
  console.info(
    JSON.stringify({ requestId: context.requestId, inbound: outcome }),
  );
  return Response.json({ outcome });
}
