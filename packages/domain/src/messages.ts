import * as v from "valibot";

import { MESSAGE_ATTACHMENT_LIMIT } from "./file";

export const THREAD_KINDS = ["direct", "group", "family"] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

const id = v.pipe(v.string(), v.uuid());
const body = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(5000));
const fileIds = v.optional(
  v.pipe(v.array(id), v.maxLength(MESSAGE_ATTACHMENT_LIMIT)),
  [],
);

export const inboxQuerySchema = v.object({
  show: v.optional(v.picklist(["all", "unread"]), "all"),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});
export type InboxQuery = v.InferOutput<typeof inboxQuerySchema>;

export const threadQuerySchema = v.object({
  id,
  before: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
    "",
  ),
});

export const sendSchema = v.object({ threadId: id, body, fileIds });

export const startSchema = v.pipe(
  v.object({
    kind: v.picklist(THREAD_KINDS),
    recipientIds: v.optional(v.pipe(v.array(id), v.maxLength(50)), []),
    studentId: v.optional(v.union([v.literal(""), id]), ""),
    subject: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), ""),
    body,
    fileIds,
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

export const draftSchema = v.object({
  threadId: id,
  draft: v.pipe(v.string(), v.maxLength(5000)),
});

export const membersSchema = v.object({
  threadId: id,
  add: v.optional(v.pipe(v.array(id), v.maxLength(50)), []),
  remove: v.optional(v.pipe(v.array(id), v.maxLength(50)), []),
});

export const recipientsQuerySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});
