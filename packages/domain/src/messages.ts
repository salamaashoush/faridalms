import * as v from "valibot";

import type { Capability } from "./capabilities";
import type { ContentDocument } from "./content";

import { contentDocumentSchema, contentPlainText } from "./content";
import { keysetField } from "./paging";

/** The conversations a person can start themselves. */
export const THREAD_KINDS = ["direct", "group", "family"] as const;
export type StartKind = (typeof THREAD_KINDS)[number];
/** A mailbox conversation belongs to a team, and only its system starts one. */
export type ThreadKind = StartKind | "mailbox";

/**
 * Inboxes a team shares rather than a person. Everyone holding a reader
 * capability sees every conversation in the mailbox and its internal
 * entries; holders of the writer capability reply, note and log contacts.
 * A conversation's owner decides whose queue it sits in, never who sees it.
 */
export const MAILBOXES = {
  admissions: {
    readers: ["admissions:read", "admissions:manage"],
    writer: "admissions:manage",
  },
  attendance: {
    readers: ["attendance:manage"],
    writer: "attendance:manage",
  },
} as const satisfies Record<
  string,
  { readers: readonly Capability[]; writer: Capability }
>;
export type Mailbox = keyof typeof MAILBOXES;
export const MAILBOX_KEYS = Object.keys(MAILBOXES) as Mailbox[];

/** The mailboxes a set of capabilities reads, and the ones it writes in. */
export function mailboxesOf(capabilities: ReadonlySet<string>): {
  reads: Mailbox[];
  writes: Mailbox[];
} {
  return {
    reads: MAILBOX_KEYS.filter((key) =>
      MAILBOXES[key].readers.some((capability) => capabilities.has(capability)),
    ),
    writes: MAILBOX_KEYS.filter((key) =>
      capabilities.has(MAILBOXES[key].writer),
    ),
  };
}

/**
 * What a conversation holds. A `message` reaches everyone in it; the rest
 * are internal to the team that shares a mailbox: a note, a call, meeting
 * or email that happened outside the app, a change the team's system
 * records (`event`), and mail that arrived at the conversation's reply
 * address but could not be trusted as the family's (`held`).
 */
export const ENTRY_KINDS = [
  "message",
  "note",
  "call",
  "meeting",
  "email",
  "event",
  "held",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
/** Contact with the family that happened outside the app and was logged. */
export const LOGGED_CONTACTS = ["call", "meeting", "email"] as const;
export type LoggedContact = (typeof LOGGED_CONTACTS)[number];
/** What a person writes into a conversation themselves. */
export const WRITTEN_KINDS = ["message", "note", ...LOGGED_CONTACTS] as const;
export type WrittenKind = (typeof WRITTEN_KINDS)[number];

export const isInternal = (kind: EntryKind) => kind !== "message";

/** What an entry records beside its words, in values that travel as JSON. */
export type DetailValue =
  | string
  | number
  | boolean
  | null
  | DetailValue[]
  | { [key: string]: DetailValue };
export type EntryDetails = { [key: string]: DetailValue };

const id = v.pipe(v.string(), v.uuid());

/** Whether a document says something: words, or a block such as a file. */
export const hasWords = (document: ContentDocument) =>
  contentPlainText(document).trim().length > 0 ||
  (document.root.children ?? []).some(
    (node) => node.type !== "paragraph" || (node.children ?? []).length > 0,
  );

/** What a message says, in the shared editor's document; files are its blocks. */
const content = v.pipe(
  contentDocumentSchema,
  v.check(hasWords, "messages.empty"),
);

/** `personal` keeps to conversations the viewer is in; a mailbox to that team's. */
export const INBOX_BOXES = ["all", "personal", ...MAILBOX_KEYS] as const;
export type InboxBox = (typeof INBOX_BOXES)[number];
/** What Messages lists: a box of conversations, or the viewer's drafts. */
export const INBOX_VIEWS = [...INBOX_BOXES, "drafts"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

/** How many conversations or drafts one request answers with. */
export const INBOX_PAGE = 50;

export const inboxQuerySchema = v.object({
  show: v.optional(v.picklist(["all", "unread"]), "all"),
  box: v.optional(v.picklist(INBOX_BOXES), "all"),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  after: keysetField,
});
export type InboxQuery = v.InferInput<typeof inboxQuerySchema>;

/** `before` is the oldest entry already shown, to read further back from. */
export const threadQuerySchema = v.object({
  id,
  before: v.optional(v.union([v.literal(""), id]), ""),
});

/**
 * A message, or in a mailbox an internal entry. `after` is the newest
 * entry the writer had on screen: a reply in a mailbox conversation where
 * someone else has since written is refused until the writer has read it,
 * unless they send it anyway.
 */
export const sendSchema = v.object({
  threadId: id,
  content,
  kind: v.optional(v.picklist(WRITTEN_KINDS), "message"),
  after: v.optional(v.union([v.literal(""), id]), ""),
  force: v.optional(v.boolean(), false),
});
export type SendMessage = v.InferOutput<typeof sendSchema>;

const optionalId = v.optional(v.union([v.literal(""), id]), "");
const version = v.pipe(v.number(), v.integer(), v.minValue(0));

/**
 * Starts a conversation. `studentId` is the child it is about: the one
 * whose family a staff member writes to, or the child a guardian names
 * when writing to a teacher. Sent from a draft, `draftId` and the version
 * read consume it, so a draft is sent once.
 */
export const startSchema = v.pipe(
  v.object({
    kind: v.picklist(THREAD_KINDS),
    recipientIds: v.optional(v.pipe(v.array(id), v.maxLength(50)), []),
    studentId: optionalId,
    subject: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), ""),
    content,
    draftId: optionalId,
    draftVersion: v.optional(version, 0),
  }),
  v.check(
    (input) =>
      input.kind === "family"
        ? input.studentId !== ""
        : input.kind === "direct"
          ? input.recipientIds.length === 1
          : input.recipientIds.length >= 2 && input.subject !== "",
    "messages.recipients",
  ),
);
export type StartThread = v.InferOutput<typeof startSchema>;

/**
 * What a composer holds, kept as someone writes: a reply to `threadId`,
 * or the first message of a conversation with whom it is for. `id` and
 * the `version` read name the draft being kept; a new one has neither.
 * Its words may still be empty, as while someone picks who to write to.
 */
export const draftSchema = v.object({
  id: optionalId,
  version: v.optional(version, 0),
  threadId: optionalId,
  kind: v.optional(v.picklist(THREAD_KINDS), "direct"),
  recipientIds: v.optional(v.pipe(v.array(id), v.maxLength(50)), []),
  studentId: optionalId,
  subject: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), ""),
  content: contentDocumentSchema,
});
export type SaveDraft = v.InferInput<typeof draftSchema>;

export const draftRefSchema = v.object({ id, version });

export const draftsQuerySchema = v.object({ after: keysetField });

export const membersSchema = v.object({
  threadId: id,
  add: v.optional(v.pipe(v.array(id), v.maxLength(50)), []),
  remove: v.optional(v.pipe(v.array(id), v.maxLength(50)), []),
});

/**
 * People come staff first, then guardians, then students, each by name;
 * `among` keeps to the students, for a family's conversation, or to
 * everyone else.
 */
export const recipientsQuerySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  among: v.optional(v.picklist(["all", "people", "students"]), "all"),
  after: v.optional(
    v.nullable(
      v.object({
        rank: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2)),
        name: v.pipe(v.string(), v.maxLength(400)),
        id,
      }),
    ),
    null,
  ),
});
export type RecipientCursor = NonNullable<
  v.InferOutput<typeof recipientsQuerySchema>["after"]
>;

/** Why mail that reached a conversation's address was kept back from it. */
export const HOLD_REASONS = ["sender", "unauthenticated"] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];
