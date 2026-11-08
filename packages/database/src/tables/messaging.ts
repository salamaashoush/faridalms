import type { EntryKind, Mailbox } from "@faridalms/domain/messages";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  bytea,
  index,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  erase,
  erasureListed,
  erasureOf,
  fk,
  instant,
  pk,
  redact,
  tenantColumns,
  uq,
} from "./conventions";
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

export type { EntryKind, Mailbox } from "@faridalms/domain/messages";
export type ThreadKind = "direct" | "group" | "family" | "mailbox";
/**
 * `owner` started a conversation, or holds a mailbox's; `member` is in it;
 * `reader` keeps a team member's read state in a mailbox conversation,
 * which the mailbox's capability, not the row, lets them read.
 */
export type ThreadRole = "owner" | "member" | "reader";

/**
 * Someone the school corresponds with who has no account: a family that
 * wrote through the website, reached by the address they gave and called
 * by the name they gave. Once a person with an account proves they hold
 * the address, `user_id` names them and their conversations become theirs.
 * `phone_normalized` is the number in E.164, as contact points keep it, so
 * "010..." and "+2010..." are found as one. An erased contact keeps its
 * row, emptied, for the conversations that name it. Mail to the address
 * that bounced for good, or that its reader reported as spam, stamps
 * `bounced_at` or `complaint_at`, and nothing more is emailed to it. A
 * family that writes from two addresses is one contact once staff merge
 * them: the other row stays, `merged_into_id` naming the one kept, so its
 * address still finds the family, and everything it was in moved across.
 */
export const messageContacts = core.table.withRLS(
  "message_contacts",
  {
    ...tenantColumns(),
    email: text("email"),
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    displayName: text("display_name").notNull(),
    locale: text("locale").$type<"en" | "ar">().notNull().default("en"),
    userId: uuid("user_id"),
    linkedAt: instant("linked_at"),
    bouncedAt: instant("bounced_at"),
    complaintAt: instant("complaint_at"),
    // Keyed to message_contacts NOT VALID by the custom migration, as
    // thread_members.contact_id.
    mergedIntoId: uuid("merged_into_id"),
    mergedAt: instant("merged_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("message_contacts", t.tenantId, t.id),
    ...baseConstraints("message_contacts", t, tenants),
    fk("message_contacts", [t.tenantId, t.userId], [users.tenantId, users.id]),
    ck(
      "message_contacts",
      "email",
      sql`email is null or (char_length(email) between 3 and 254 and email = lower(email) and strpos(email, '@') > 1)`,
    ),
    ck("message_contacts", "phone", sql`char_length(phone) between 1 and 40`),
    ck(
      "message_contacts",
      "phone_normalized",
      sql`phone_normalized ~ '^\\+[1-9][0-9]{6,14}$'`,
    ),
    ck(
      "message_contacts",
      "reach",
      sql`status = 'tobedeleted' or email is not null or phone is not null`,
    ),
    ck(
      "message_contacts",
      "display_name",
      sql`char_length(display_name) <= 120 and (status = 'tobedeleted' or char_length(display_name) >= 1)`,
    ),
    ck("message_contacts", "locale", sql`locale in ('en', 'ar')`),
    ck(
      "message_contacts",
      "linked",
      sql`(user_id is null) = (linked_at is null)`,
    ),
    ck(
      "message_contacts",
      "merged",
      sql`(merged_into_id is null) = (merged_at is null) and merged_into_id is distinct from id`,
    ),
    index("message_contacts_merged_idx")
      .on(t.tenantId, t.mergedIntoId)
      .where(sql`merged_into_id is not null`),
    uniqueIndex("message_contacts_email_key")
      .on(t.tenantId, t.email)
      .where(sql`status = 'active' and email is not null`),
    index("message_contacts_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active' and user_id is not null`),
    index("message_contacts_phone_idx")
      .on(t.tenantId, t.phoneNormalized)
      .where(sql`status = 'active' and phone_normalized is not null`),
    ...entityProfile(),
    ...erase(
      sql`${erasureOf("id")} or ${erasureOf("user_id")} or ${erasureOf("merged_into_id")}`,
    ),
  ],
);

/**
 * A conversation. `family` threads are one staff member with a child's
 * guardians, about that child; `direct` is two people, about a child when
 * a guardian says which; `group` is several
 * people a staff member gathered, and can gain or lose members. A
 * `mailbox` conversation belongs to a team's mailbox: everyone who holds
 * the mailbox's capability reads it, and its owner is who holds it now.
 */
export const messageThreads = core.table.withRLS(
  "message_threads",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    kind: text("kind").$type<ThreadKind>().notNull(),
    mailbox: text("mailbox").$type<Mailbox>(),
    subject: text("subject"),
    studentUserId: uuid("student_user_id"),
    // Null for a conversation a visitor began, such as a website enquiry.
    createdByUserId: uuid("created_by_user_id"),
    lastMessageAt: instant("last_message_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("message_threads", t.tenantId, t.id),
    ...baseConstraints("message_threads", t, tenants),
    fk("message_threads", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "message_threads",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "message_threads",
      [t.tenantId, t.createdByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "message_threads",
      "kind",
      sql`kind in ('direct', 'group', 'family', 'mailbox')`,
    ),
    ck(
      "message_threads",
      "mailbox",
      sql`mailbox in ('admissions', 'attendance')`,
    ),
    ck(
      "message_threads",
      "mailbox_kind",
      sql`(kind = 'mailbox') = (mailbox is not null)`,
    ),
    ck(
      "message_threads",
      "subject",
      sql`char_length(subject) between 1 and 200`,
    ),
    ck(
      "message_threads",
      "student",
      sql`(kind = 'family' and student_user_id is not null) or kind in ('mailbox', 'direct') or (student_user_id is null)`,
    ),
    index("message_threads_org_idx")
      .on(t.tenantId, t.orgId, t.lastMessageAt)
      .where(sql`status = 'active'`),
    index("message_threads_mailbox_idx")
      .on(t.tenantId, t.orgId, t.mailbox, t.lastMessageAt)
      .where(sql`status = 'active' and mailbox is not null`),
    index("message_threads_student_idx")
      .on(t.tenantId, t.mailbox, t.studentUserId)
      .where(sql`status = 'active' and student_user_id is not null`),
    ...entityProfile(),
    ...erase(erasureListed("message_thread", "id")),
  ],
);

/**
 * Who is in a thread and how far they have read. A member who leaves keeps
 * the row with `left_at`, so what they wrote still names them. A member is
 * a person, or an outside contact reached by email; a contact's row also
 * names the person once one is linked. `reply_key` is the SHA-256 of the
 * contact's reply token for this conversation; the token itself is derived
 * from the cell's secret when an email is sent and never stored. In a
 * mailbox conversation only a `member` is in it; its owner's and the
 * team's `reader` rows keep read state, and the mailbox's capability, not
 * a row, lets them in.
 */
export const threadMembers = core.table.withRLS(
  "thread_members",
  {
    ...tenantColumns(),
    threadId: uuid("thread_id").notNull(),
    userId: uuid("user_id"),
    // Keyed to message_contacts NOT VALID by the custom migration: drizzle-kit
    // writes a key on an existing table as validated, and validating reads
    // the table under forced row security, where a migration has no tenant.
    contactId: uuid("contact_id"),
    role: text("role").$type<ThreadRole>().notNull().default("member"),
    joinedAt: instant("joined_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    leftAt: instant("left_at"),
    lastReadAt: instant("last_read_at"),
    replyKey: bytea("reply_key"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("thread_members", t.tenantId, t.id),
    ...baseConstraints("thread_members", t, tenants),
    fk(
      "thread_members",
      [t.tenantId, t.threadId],
      [messageThreads.tenantId, messageThreads.id],
    ),
    fk("thread_members", [t.tenantId, t.userId], [users.tenantId, users.id]),
    ck("thread_members", "role", sql`role in ('owner', 'member', 'reader')`),
    ck(
      "thread_members",
      "member",
      sql`user_id is not null or contact_id is not null`,
    ),
    ck(
      "thread_members",
      "left_at",
      sql`left_at is null or left_at >= joined_at`,
    ),
    ck(
      "thread_members",
      "reply_key",
      sql`reply_key is null or (contact_id is not null and octet_length(reply_key) = 32)`,
    ),
    uniqueIndex("thread_members_key")
      .on(t.tenantId, t.threadId, t.userId)
      .where(sql`status = 'active' and left_at is null`),
    uniqueIndex("thread_members_contact_key")
      .on(t.tenantId, t.threadId, t.contactId)
      .where(
        sql`status = 'active' and left_at is null and contact_id is not null`,
      ),
    uniqueIndex("thread_members_reply_key")
      .on(t.tenantId, t.replyKey)
      .where(sql`reply_key is not null`),
    index("thread_members_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active' and left_at is null`),
    index("thread_members_contact_idx")
      .on(t.tenantId, t.contactId)
      .where(sql`status = 'active' and contact_id is not null`),
    ...entityProfile(),
    ...erase(
      sql`${erasureOf("user_id")} or ${erasureOf("contact_id")} or ${erasureListed("message_thread", "thread_id")}`,
    ),
  ],
);

/**
 * What someone is still writing, kept as they type: a reply to a
 * conversation (`thread_id`), or the first message of one not yet started,
 * with whom it is for (`kind`, `recipient_ids`, `student_user_id`,
 * `subject`) as the composer had them. Its words are a document hosted as
 * `message_draft`, files included as its blocks; `body` is their plain
 * text for the Drafts list. Sending writes the message and tombstones the
 * draft in one transaction, naming the version read, so a draft sends
 * once. Only its writer reads it.
 */
export const messageDrafts = core.table.withRLS(
  "message_drafts",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    threadId: uuid("thread_id"),
    kind: text("kind").$type<"direct" | "group" | "family">(),
    recipientIds: uuid("recipient_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    studentUserId: uuid("student_user_id"),
    subject: text("subject"),
    body: text("body").notNull().default(""),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("message_drafts", t.tenantId, t.id),
    ...baseConstraints("message_drafts", t, tenants),
    fk("message_drafts", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk("message_drafts", [t.tenantId, t.userId], [users.tenantId, users.id]),
    fk(
      "message_drafts",
      [t.tenantId, t.threadId],
      [messageThreads.tenantId, messageThreads.id],
    ),
    fk(
      "message_drafts",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck("message_drafts", "kind", sql`kind in ('direct', 'group', 'family')`),
    ck(
      "message_drafts",
      "start",
      sql`(thread_id is null) = (kind is not null)`,
    ),
    ck(
      "message_drafts",
      "reply",
      sql`thread_id is null or (cardinality(recipient_ids) = 0 and student_user_id is null and subject is null)`,
    ),
    ck(
      "message_drafts",
      "recipient_ids",
      sql`cardinality(recipient_ids) <= 50`,
    ),
    ck(
      "message_drafts",
      "subject",
      sql`char_length(subject) between 1 and 200`,
    ),
    ck("message_drafts", "body", sql`char_length(body) <= 5000`),
    uniqueIndex("message_drafts_reply_key")
      .on(t.tenantId, t.threadId, t.userId)
      .where(sql`status = 'active' and thread_id is not null`),
    index("message_drafts_user_idx")
      .on(t.tenantId, t.userId, t.orgId, t.dateLastModified)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...erase(
      sql`${erasureOf("user_id")} or ${erasureOf("student_user_id")} or ${erasureListed("message_thread", "thread_id")}`,
    ),
  ],
);

/**
 * One entry of a conversation. A `message` is for everyone in it, written
 * by a person or by an outside contact; every other kind is internal to
 * the school's side of it (see `ENTRY_KINDS`). What was written is the
 * entry's document in the shared editor's format (`core.documents`,
 * hosted as `message`, frozen once sent), files included as its blocks;
 * `body` is its plain text, derived on the server, for search, previews
 * and the text part of an email. `details` keeps what an entry records
 * beside its words: an event's change, a logged contact's outcome, held
 * mail's sender and reason, and for mail that arrived, the provider's id,
 * which is unique so a webhook delivered twice posts once. Erasure empties
 * an entry and keeps its place, so the conversation still reads in order.
 */
export const messages = core.table.withRLS(
  "messages",
  {
    ...tenantColumns(),
    threadId: uuid("thread_id").notNull(),
    kind: text("kind").$type<EntryKind>().notNull().default("message"),
    authorUserId: uuid("author_user_id"),
    // Keyed NOT VALID by the custom migration, as thread_members.contact_id.
    authorContactId: uuid("author_contact_id"),
    body: text("body").notNull(),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    redactedAt: instant("redacted_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("messages", t.tenantId, t.id),
    uq("messages", t.tenantId, t.id, t.threadId),
    ...baseConstraints("messages", t, tenants),
    fk(
      "messages",
      [t.tenantId, t.threadId],
      [messageThreads.tenantId, messageThreads.id],
    ),
    fk("messages", [t.tenantId, t.authorUserId], [users.tenantId, users.id]),
    ck(
      "messages",
      "kind",
      sql`kind in ('message', 'note', 'call', 'meeting', 'email', 'event', 'held')`,
    ),
    ck(
      "messages",
      "body",
      sql`char_length(body) <= 5000 and (redacted_at is not null or kind in ('event', 'call', 'meeting', 'email') or char_length(body) >= 1)`,
    ),
    ck(
      "messages",
      "author",
      sql`num_nonnulls(author_user_id, author_contact_id) = case when kind = 'message' then 1 else num_nonnulls(author_user_id) end
        and (kind not in ('note', 'call', 'meeting', 'email') or author_user_id is not null)`,
    ),
    ck(
      "messages",
      "details",
      sql`jsonb_typeof(details) = 'object' and octet_length(details::text) <= 8192`,
    ),
    ck(
      "messages",
      "redacted",
      sql`redacted_at is null or (body = '' and details = '{}')`,
    ),
    index("messages_thread_idx")
      .on(t.tenantId, t.threadId, t.createdAt)
      .where(sql`status = 'active'`),
    uniqueIndex("messages_email_key")
      .on(t.tenantId, sql`(details ->> 'emailId')`)
      .where(sql`details ? 'emailId'`),
    index("messages_logged_idx")
      .on(t.tenantId, sql`(details ->> 'studentId')`, sql`(details ->> 'on')`)
      .where(sql`status = 'active' and details ? 'studentId'`),
    ...entityProfile(),
    // What a person wrote, as themselves or as the contact linked to them,
    // and everything in a conversation the erasure lists.
    ...redact(
      sql`${erasureOf("author_user_id")} or ${erasureOf("author_contact_id")}
        or ${erasureListed("message_thread", "thread_id")}
        or exists (select 1 from core.message_contacts c where c.tenant_id = messages.tenant_id
          and c.id = messages.author_contact_id and app.erasure_approved(c.tenant_id, c.user_id))`,
    ),
  ],
);
