import type { CellTransaction } from "@faridalms/database/context";
import type { ContentDocument } from "@faridalms/domain/content";
import type { EntryKind, Mailbox } from "@faridalms/domain/messages";

import { writeAudit } from "@faridalms/database/audit";
import { capabilityHolders } from "@faridalms/database/stores/access";
import { saveDocument } from "@faridalms/database/stores/documents";
import {
  createThread,
  linkOutsideParticipant,
  mailedMembers,
  membersOf,
  postMessage,
  threadById,
} from "@faridalms/database/stores/messages";
import { queueConversationMail } from "@faridalms/database/stores/notifications";
import { contentPlainText } from "@faridalms/domain/content";
import { MAILBOXES } from "@faridalms/domain/messages";

import type { UnitContext } from "../core/context";
import type { NoticeScope } from "../core/notify";

import { notifyIn } from "../core/notify";

/**
 * Where a conversation is written from: a person's procedure, or a unit
 * the system opened for a visitor's form or a reply that came by email,
 * where nobody signed in is the actor.
 */
export interface ConversationScope extends NoticeScope {
  today: string;
}

export const scopeOf = (context: UnitContext): ConversationScope => ({
  tx: context.tx,
  tenantId: context.tenantId,
  schoolId: context.schoolId,
  actorUserId: context.actor.userId,
  now: context.now,
  channels: context.channels,
  today: context.today,
});

export interface WrittenEntry {
  threadId: string;
  id: string;
  kind: EntryKind;
  authorUserId: string | null;
  fromOutside: boolean;
}

/**
 * What a system that owns a mailbox does when its conversations change:
 * admissions, for one, records that a family was answered.
 */
export interface MailboxHooks {
  written?: (scope: ConversationScope, entry: WrittenEntry) => Promise<void>;
}

const hooks = new Map<Mailbox, MailboxHooks>();

export function registerMailbox(mailbox: Mailbox, rules: MailboxHooks) {
  hooks.set(mailbox, rules);
}

/** Everyone who works a mailbox: the holders of its writer capability. */
export async function mailboxTeam(
  scope: ConversationScope,
  mailbox: Mailbox,
): Promise<string[]> {
  const rows = await capabilityHolders(scope.tx, {
    tenantId: scope.tenantId,
    schoolId: scope.schoolId,
    today: scope.today,
    capability: MAILBOXES[mailbox].writer,
  });
  return rows.map((row) => row.id);
}

/** A new conversation in a team's mailbox, held by its owner or by nobody yet. */
export function openMailboxConversation(
  scope: ConversationScope,
  input: {
    mailbox: Mailbox;
    subject: string | null;
    studentId?: string | null;
    ownerId: string | null;
    contactIds?: readonly string[];
    memberIds?: readonly string[];
  },
): Promise<string> {
  return createThread(scope.tx, {
    tenantId: scope.tenantId,
    schoolId: scope.schoolId,
    kind: "mailbox",
    mailbox: input.mailbox,
    subject: input.subject,
    studentId: input.studentId ?? null,
    createdBy: scope.actorUserId,
    ownerId: input.ownerId,
    memberIds: input.memberIds ?? [],
    contactIds: input.contactIds ?? [],
  });
}

/**
 * Writes an entry into a conversation and lets it reach whoever it is for:
 * its words as a frozen document, a message to outside contacts queued as
 * email, notices to the people in it, and the mailbox's own system told.
 * Every way into a conversation (the composer, a website enquiry, a reply
 * by email, a recorded change) ends here, so they cannot differ.
 */
export async function writeEntry(
  scope: ConversationScope,
  input: {
    /** The entry's id when its files were placed against it already. */
    id?: string;
    threadId: string;
    kind: EntryKind;
    authorUserId: string | null;
    authorContactId?: string | null;
    content: ContentDocument | null;
    mediaIds?: readonly string[];
    details?: Record<string, unknown>;
    /** Whether people hear of it; a recorded change or a first enquiry is told otherwise. */
    notify?: boolean;
  },
): Promise<{ id: string; createdAt: string }> {
  const thread = await threadById(scope.tx, scope.tenantId, input.threadId);
  if (!thread) throw new Error("conversation not found");
  const plainText = input.content ? contentPlainText(input.content) : "";

  const posted = await postMessage(scope.tx, {
    id: input.id,
    tenantId: scope.tenantId,
    threadId: thread.id,
    kind: input.kind,
    authorId: input.authorUserId,
    authorContactId: input.authorContactId ?? null,
    body: plainText.slice(0, 5000),
    details: input.details ?? {},
  });
  if (input.content)
    await saveDocument(scope.tx, {
      tenantId: scope.tenantId,
      orgId: thread.orgId,
      host: { type: "message", id: posted.id },
      content: input.content as unknown as Record<string, unknown>,
      plainText,
      mediaIds: input.mediaIds ?? [],
      userId: input.authorUserId,
      frozen: true,
    });
  const members = await membersOf(scope.tx, scope.tenantId, thread.id);
  const outsideAuthor =
    Boolean(input.authorContactId) ||
    members.some(
      (member) =>
        thread.mailbox !== null &&
        member.role === "member" &&
        member.userId !== null &&
        member.userId === input.authorUserId,
    );
  if (input.kind === "message" && !outsideAuthor) {
    const mailed = await mailedMembers(scope.tx, {
      tenantId: scope.tenantId,
      threadId: thread.id,
    });
    await queueConversationMail(scope.tx, {
      tenantId: scope.tenantId,
      messageId: posted.id,
      rows: mailed.map((member) => ({
        contactId: member.contactId,
        address: member.email,
        locale: member.locale,
        state: scope.channels.email ? "pending" : "skipped",
        reason: scope.channels.email ? null : "no_provider",
      })),
    });
  }
  if (input.notify !== false) {
    const author = members.find(
      (member) =>
        (input.authorContactId && member.contactId === input.authorContactId) ||
        (input.authorUserId && member.userId === input.authorUserId),
    );
    let told: string[];
    if (!thread.mailbox)
      told = members.flatMap((member) =>
        member.userId ? [member.userId] : [],
      );
    else {
      const owner = members.find((member) => member.role === "owner");
      const outside = members.flatMap((member) =>
        member.role === "member" && member.userId ? [member.userId] : [],
      );
      const team =
        outsideAuthor || input.kind === "held"
          ? owner?.userId
            ? [owner.userId]
            : await mailboxTeam(scope, thread.mailbox)
          : owner?.userId
            ? [owner.userId]
            : [];
      told = [...team, ...(input.kind === "message" ? outside : [])];
    }
    await notifyIn(scope, told, {
      kind: "message",
      subject: { type: "message_thread", id: thread.id },
      params: {
        actorName: author?.fullNameEn ?? author?.fullNameAr ?? "",
        actorNameAr: author?.fullNameAr ?? author?.fullNameEn ?? "",
        preview: plainText.slice(0, 140),
      },
      collapse: true,
    });
  }
  const written = thread.mailbox ? hooks.get(thread.mailbox)?.written : null;
  if (written)
    await written(scope, {
      threadId: thread.id,
      id: posted.id,
      kind: input.kind,
      authorUserId: input.authorUserId,
      fromOutside: outsideAuthor,
    });
  return posted;
}

/**
 * Hands a person the conversations an outside contact had from an address
 * they have proved is theirs: when family registration verifies the email
 * of a new account, the family's enquiries and every reply in them appear
 * in their portal's Messages, nothing copied. Call it only with an address
 * the person has verified; it is audited.
 */
export async function claimConversations(
  tx: CellTransaction,
  input: {
    tenantId: string;
    schoolId: string;
    userId: string;
    verifiedEmail: string;
  },
): Promise<{ conversations: number }> {
  const linked = await linkOutsideParticipant(tx, {
    tenantId: input.tenantId,
    userId: input.userId,
    verifiedEmail: input.verifiedEmail,
  });
  if (linked.contactId)
    await writeAudit(tx, input.tenantId, {
      action: "message_contact.link",
      objectType: "message_contact",
      objectId: linked.contactId,
      orgId: input.schoolId,
      subjectUserId: input.userId,
      details: { conversations: linked.conversations },
    });
  return { conversations: linked.conversations };
}
