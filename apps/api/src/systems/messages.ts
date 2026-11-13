import type { ContentDocument } from "@faridalms/domain/content";
import type {
  EntryDetails,
  Mailbox,
  StartKind,
} from "@faridalms/domain/messages";

import { saveDocument } from "@faridalms/database/stores/documents";
import { rehostFiles } from "@faridalms/database/stores/files";
import {
  addMembers,
  consumeDraft,
  createThread,
  draftOf,
  draftsOf,
  existingThread,
  inThread,
  keepDraft,
  mailboxContacts,
  markRead as markThreadRead,
  mergeContacts as mergeContactRows,
  membersOf,
  messagesOf,
  readsMessage,
  removeMembers,
  takeHeld,
  threadById,
  threadsOf,
  unreadThreads,
  writtenSince,
} from "@faridalms/database/stores/messages";
import { readSubject } from "@faridalms/database/stores/notifications";
import { namesOf } from "@faridalms/database/stores/persons";
import {
  roomOf,
  signTicket,
  TICKET_TTL_SECONDS,
} from "@faridalms/domain/collab";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { plainContent } from "@faridalms/domain/content-conversion";
import {
  acceptHeldSchema,
  contactsQuerySchema,
  draftRefSchema,
  draftSchema,
  draftsQuerySchema,
  hasWords,
  INBOX_PAGE,
  inboxQuerySchema,
  isInternal,
  mailboxesOf,
  membersSchema,
  mergeContactsSchema,
  recipientsQuerySchema,
  sendSchema,
  startSchema,
  threadQuerySchema,
} from "@faridalms/domain/messages";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { contributionsTo } from "../core/extension";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { isStaff, recordLinks, requireStudent } from "../core/reach";
import { coreReader, placeMedia } from "../files/authorize";
import { scopeOf, writeEntry } from "../messages/conversations";
import {
  learnersToName,
  recipientsFor,
  unreachableFor,
} from "../messages/reach";
import { readerOf } from "../messages/standing";
import { actingFor, actorsFor } from "../people/acting";

const id = v.pipe(v.string(), v.uuid());

/** How many entries of a conversation one request shows. */
const THREAD_PAGE = 100;

/** The mailboxes the viewer's capabilities read and write in. */
const mailboxesFor = (context: UnitContext) =>
  mailboxesOf(context.actor.capabilities);

const draftConflict = () =>
  new ORPCError("CONFLICT", { message: "message_draft.revision_conflict" });

/**
 * A conversation of this school the viewer reaches, or not found: one
 * they are in, or one in a mailbox their team shares, which they read
 * whole, internal entries included. In a mailbox conversation only a
 * contact's row, theirs once linked, makes someone a member; a staff
 * member's row there keeps read state and lets them in to nothing.
 */
async function openThread(context: UnitContext, threadId: string) {
  const thread = await threadById(context.tx, context.tenantId, threadId);
  if (!thread || thread.orgId !== context.schoolId)
    throw new ORPCError("NOT_FOUND");
  const members = await membersOf(context.tx, context.tenantId, thread.id);
  const boxes = mailboxesFor(context);
  const team = thread.mailbox !== null && boxes.reads.includes(thread.mailbox);
  const seat = members.find(
    (row) =>
      row.userId === context.actor.userId &&
      (thread.mailbox === null || row.role === "member"),
  );
  const me =
    seat &&
    (!thread.studentId ||
      (await inThread(context.tx, await readerOf(context), thread.id)))
      ? seat
      : null;
  if (!team && !me) throw new ORPCError("NOT_FOUND");
  return {
    thread,
    members,
    me,
    team,
    /** Whether the viewer writes here: their team's writer, or a member who may send. */
    writes: team
      ? boxes.writes.includes(thread.mailbox as Mailbox)
      : can(context, "messages:send"),
  };
}

coreReader("message", async (context, hostId) =>
  readsMessage(context.tx, await readerOf(context), hostId),
);

// A draft is its writer's alone, files included.
coreReader("message_draft", async (context, hostId) =>
  Boolean(
    await draftOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      userId: context.actor.userId,
      id: hostId,
    }),
  ),
);

/** Reading Messages needs its capability, or a mailbox to read. */
function readsMessages(context: UnitContext) {
  if (mailboxesFor(context).reads.length) return;
  requireCapability(context, "messages:read");
}

/**
 * The learners someone who acts for them may say a message is about; none
 * for staff, who write to those who act for a learner instead.
 */
async function childrenToName(context: UnitContext) {
  if (isStaff(context) || !can(context, "messages:send")) return [];
  return learnersToName(context);
}

/** Whether a module knows who acts for learners, so staff may write to them about one. */
async function writesToActors(context: UnitContext) {
  return (
    isStaff(context) &&
    can(context, "messages:send") &&
    (await contributionsTo(context, actingFor)).length > 0
  );
}

export const inbox = readProcedure
  .input(inboxQuerySchema)
  .handler(async ({ input, context }) => {
    readsMessages(context);
    const boxes = mailboxesFor(context);
    const box =
      input.box === "all" ||
      input.box === "personal" ||
      boxes.reads.includes(input.box)
        ? input.box
        : "personal";
    const [page, children, family] = await Promise.all([
      threadsOf(context.tx, {
        ...(await readerOf(context)),
        box,
        unreadOnly: input.show === "unread",
        q: input.q,
        limit: INBOX_PAGE,
        after: input.after,
      }),
      childrenToName(context),
      writesToActors(context),
    ]);
    return {
      rows: page.rows,
      next: page.next,
      mailboxes: boxes.reads,
      canStart: can(context, "messages:send"),
      canStartFamily: family,
      children,
    };
  });

export const unread = readProcedure.handler(async ({ context }) => {
  readsMessages(context);
  return {
    threads: await unreadThreads(context.tx, await readerOf(context)),
  };
});

export const thread = readProcedure
  .input(threadQuerySchema)
  .handler(async ({ input, context }) => {
    const opened = await openThread(context, input.id);
    const { thread: row, members, team } = opened;
    const fetched = await messagesOf(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      before: input.before || null,
      limit: THREAD_PAGE + 1,
      internal: team,
    });
    // Read newest first and shown oldest first, so the row past the page is
    // the oldest one fetched.
    const rows = fetched.length > THREAD_PAGE ? fetched.slice(1) : fetched;
    const next = fetched.length > THREAD_PAGE ? (rows[0]?.id ?? null) : null;
    const staff = isStaff(context);
    const [[student], draft] = await Promise.all([
      row.studentId
        ? namesOf(context.tx, context.tenantId, [row.studentId])
        : Promise.resolve([]),
      opened.writes
        ? draftOf(context.tx, {
            tenantId: context.tenantId,
            schoolId: context.schoolId,
            userId: context.actor.userId,
            threadId: row.id,
          })
        : Promise.resolve(null),
    ]);
    // A mailbox conversation shows its outside contacts and who holds it;
    // the team's own read rows are nobody's business.
    const shown = members.filter(
      (member) => row.mailbox === null || member.role !== "reader",
    );
    const linkOf = await recordLinks(context, [
      ...shown.map((member) => member.userId),
      ...rows.map((message) => message.authorId),
    ]);
    return {
      id: row.id,
      kind: row.kind,
      mailbox: row.mailbox,
      subject: row.subject,
      student: row.studentId
        ? {
            id: row.studentId,
            fullNameEn: student?.fullNameEn ?? null,
            fullNameAr: student?.fullNameAr ?? null,
          }
        : null,
      members: shown.map((member) => ({
        userId: member.userId,
        contactId: member.contactId,
        fullNameEn: member.fullNameEn,
        fullNameAr: member.fullNameAr,
        role: member.role,
        outside: member.contactId !== null,
        email: team ? member.email : null,
        /** Why mail no longer reaches a contact, for the team that writes to it. */
        unreachable: team ? member.unreachable : null,
        aliases: team ? member.aliases : [],
        lastReadAt: staff ? member.lastReadAt : null,
        link: linkOf(member.userId),
      })),
      owner:
        row.mailbox !== null
          ? (() => {
              const owner = members.find(
                (member) => member.role === "owner" && !member.contactId,
              );
              return owner
                ? {
                    userId: owner.userId,
                    fullNameEn: owner.fullNameEn,
                    fullNameAr: owner.fullNameAr,
                  }
                : null;
            })()
          : null,
      draft: draft
        ? {
            id: draft.id,
            version: draft.version,
            content: (draft.content ??
              plainContent(draft.body)) as unknown as ContentDocument,
          }
        : null,
      team,
      canWrite: opened.writes,
      canNote: team && opened.writes,
      /** Whether a message here also reaches someone by email. */
      emailsOutside: members.some(
        (member) =>
          member.contactId !== null &&
          member.email !== null &&
          member.userId === null,
      ),
      canManage: row.kind === "group" && opened.me?.role === "owner",
      showsSeen: staff,
      latestId: rows.at(-1)?.id ?? null,
      messages: rows.map((message) => ({
        id: message.id,
        kind: message.kind,
        authorId: message.authorId,
        authorContactId: message.authorContactId,
        authorNameEn: message.authorNameEn,
        authorNameAr: message.authorNameAr,
        authorLink: message.authorContactId ? null : linkOf(message.authorId),
        body: message.body,
        content: message.content as unknown as ContentDocument | null,
        details: (team || message.kind === "message"
          ? message.details
          : {}) as EntryDetails,
        redacted: message.redacted,
        createdAt: message.createdAt,
      })),
      next,
    };
  });

export const recipients = readProcedure
  .input(recipientsQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    return recipientsFor(context, {
      q: input.q,
      limit: 30,
      after: input.after,
      among: input.among,
    });
  });

/**
 * A message, or in a mailbox conversation an internal note or a contact
 * logged. One action whether written in Messages or on the record the
 * conversation belongs to, such as an enquiry. A reply that someone else
 * has overtaken since the writer last looked is refused until they have
 * read it, unless they send it anyway.
 */
export const send = writeProcedure
  .input(sendSchema)
  .handler(async ({ input, context }) => {
    const {
      thread: row,
      team,
      writes,
    } = await openThread(context, input.threadId);
    if (!writes) throw new ORPCError("FORBIDDEN");
    if (isInternal(input.kind) && !team) throw new ORPCError("FORBIDDEN");
    if (team && input.kind === "message" && !input.force) {
      const newer = await writtenSince(context.tx, {
        tenantId: context.tenantId,
        threadId: row.id,
        afterId: input.after || null,
        viewerId: context.actor.userId,
      });
      if (newer)
        throw new ORPCError("CONFLICT", {
          message: "messages.newer",
          data: { latestId: newer.id },
        });
    }
    const draft = await draftOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      userId: context.actor.userId,
      threadId: row.id,
    });
    return writeComposed(context, {
      threadId: row.id,
      kind: input.kind,
      content: input.content,
      draftId: draft?.id ?? null,
    });
  });

/**
 * Writes what someone composed. The entry's id is made first, so the files
 * its document shows are placed in its keeping before the document is
 * saved, and its readers are the ones who may open them. Written from a
 * draft, the draft's files move to the entry rather than being copied.
 */
async function writeComposed(
  context: UnitContext,
  input: {
    threadId: string;
    kind: v.InferOutput<typeof sendSchema>["kind"];
    content: ContentDocument;
    draftId: string | null;
    details?: Record<string, unknown>;
  },
) {
  const entryId = Bun.randomUUIDv7();
  const fileIds = contentFileIds(input.content);
  if (input.draftId)
    await rehostFiles(context.tx, {
      tenantId: context.tenantId,
      from: { type: "message_draft", id: input.draftId },
      to: { type: "message", id: entryId },
      ids: fileIds,
    });
  const placed = await placeMedia(
    context,
    { type: "message", id: entryId },
    input.content,
    fileIds,
  );
  return writeEntry(scopeOf(context), {
    id: entryId,
    threadId: input.threadId,
    kind: input.kind,
    authorUserId: context.actor.userId,
    content: placed.content,
    mediaIds: placed.mediaIds,
    details: input.details ?? {},
  });
}

/**
 * Who a new conversation is for, checked as starting it checks them: a
 * learner the viewer reaches, for those who act for them; people the viewer
 * may write to; and for whoever acts for a learner, one of theirs to say it
 * is about.
 */
async function checkAddressees(
  context: UnitContext,
  input: { kind: StartKind; recipientIds: string[]; studentId: string },
) {
  if (input.kind === "family") {
    if (!(await writesToActors(context))) throw new ORPCError("FORBIDDEN");
    if (input.studentId)
      await requireStudent(context, "classes", input.studentId);
    return;
  }
  if (input.kind === "group" && !isStaff(context))
    throw new ORPCError("FORBIDDEN");
  const outside = await unreachableFor(context, input.recipientIds);
  if (outside.length)
    throw new ORPCError("FORBIDDEN", { message: "messages.recipient" });
  if (
    input.kind === "direct" &&
    input.studentId &&
    !(await childrenToName(context)).some(
      (child) => child.userId === input.studentId,
    )
  )
    throw new ORPCError("NOT_FOUND");
}

/** Writes to someone new: continues an open conversation with them, or starts one. */
export const start = writeProcedure
  .input(startSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    const me = context.actor.userId;
    const studentId = input.kind === "group" ? "" : input.studentId;
    await checkAddressees(context, {
      kind: input.kind,
      recipientIds: input.kind === "family" ? [] : input.recipientIds,
      studentId,
    });
    if (
      input.draftId &&
      !(await consumeDraft(context.tx, {
        tenantId: context.tenantId,
        userId: me,
        id: input.draftId,
        version: input.draftVersion,
      }))
    )
      throw draftConflict();
    let threadId: string | null = null;
    let created = false;
    if (input.kind === "family") {
      const guardians = [
        ...new Set(
          (
            await actorsFor(context, {
              studentIds: [input.studentId],
              on: context.today,
              purpose: "contact",
            })
          ).map((link) => link.userId),
        ),
      ];
      if (guardians.length === 0)
        throw new ORPCError("CONFLICT", { message: "messages.no_guardians" });
      threadId = await existingThread(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        kind: "family",
        memberIds: [],
        studentId: input.studentId,
        ownerId: me,
      });
      if (threadId) {
        await addMembers(context.tx, {
          tenantId: context.tenantId,
          threadId,
          userIds: guardians,
          role: "member",
        });
      } else {
        threadId = await createThread(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          kind: "family",
          subject: null,
          studentId: input.studentId,
          createdBy: me,
          ownerId: me,
          memberIds: guardians,
        });
        created = true;
      }
    } else {
      if (input.kind === "direct")
        threadId = await existingThread(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          kind: "direct",
          memberIds: [me, ...input.recipientIds],
          studentId: studentId || null,
          ownerId: me,
        });
      if (!threadId) {
        threadId = await createThread(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          kind: input.kind,
          subject: input.kind === "group" ? input.subject : null,
          studentId: studentId || null,
          createdBy: me,
          ownerId: me,
          memberIds: input.recipientIds,
        });
        created = true;
      }
    }
    await writeComposed(context, {
      threadId,
      kind: "message",
      content: input.content,
      draftId: input.draftId || null,
    });
    if (created)
      await audit(context, {
        action: "message_thread.create",
        objectType: "message_thread",
        objectId: threadId,
        studentUserId: studentId || null,
        details: { kind: input.kind, members: input.recipientIds.length },
      });
    return { threadId, created };
  });

export const markRead = writeProcedure
  .input(v.object({ threadId: id }))
  .handler(async ({ input, context }) => {
    const { thread: row } = await openThread(context, input.threadId);
    await markThreadRead(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      userId: context.actor.userId,
    });
    await readSubject(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      subjectType: "message_thread",
      subjectId: row.id,
    });
    return { read: true };
  });

/**
 * Keeps what someone is writing, as they write it: a reply to a
 * conversation they may write in, or the first message of a new one with
 * whom it is for, checked as sending would check it. Its words are a
 * document like a sent message's, files placed in the draft's keeping.
 * A draft left with nothing in it is let go. A version that moved on, in
 * another tab or because the draft was sent, is refused.
 */
export const saveDraft = writeProcedure
  .input(draftSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    const reply = input.threadId !== "";
    if (reply) {
      const { writes } = await openThread(context, input.threadId);
      if (!writes) throw new ORPCError("FORBIDDEN");
    } else
      await checkAddressees(context, {
        kind: input.kind,
        recipientIds: input.kind === "family" ? [] : input.recipientIds,
        studentId: input.kind === "group" ? "" : input.studentId,
      });
    const empty =
      !hasWords(input.content) &&
      (reply ||
        (input.recipientIds.length === 0 &&
          input.studentId === "" &&
          input.subject === ""));
    if (empty) {
      if (
        input.id &&
        !(await consumeDraft(context.tx, {
          tenantId: context.tenantId,
          userId: context.actor.userId,
          id: input.id,
          version: input.version,
        }))
      )
        throw draftConflict();
      return { id: "", version: 0 };
    }
    const plainText = contentPlainText(input.content);
    const kept = await keepDraft(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      userId: context.actor.userId,
      id: input.id || null,
      version: input.version,
      threadId: reply ? input.threadId : null,
      kind: reply ? null : input.kind,
      recipientIds: reply || input.kind === "family" ? [] : input.recipientIds,
      studentId:
        reply || input.kind === "group" ? null : input.studentId || null,
      subject: reply || input.kind !== "group" ? null : input.subject || null,
      body: plainText.slice(0, 5000),
    });
    if (!kept) throw draftConflict();
    const placed = await placeMedia(
      context,
      { type: "message_draft", id: kept.id },
      input.content,
      contentFileIds(input.content),
    );
    await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host: { type: "message_draft", id: kept.id },
      content: placed.content,
      plainText,
      mediaIds: placed.mediaIds,
      userId: context.actor.userId,
    });
    return kept;
  });

/** The viewer's drafts at this school, last kept first, a page at a time. */
export const drafts = readProcedure
  .input(draftsQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    return draftsOf(context.tx, {
      ...(await readerOf(context)),
      limit: INBOX_PAGE,
      after: input.after,
    });
  });

/**
 * A draft of a new conversation, to pick up where it was left: with whom
 * it is for, those the viewer may still write to, and its words. A reply
 * being written names its conversation, which holds it. Null once it was
 * sent or deleted, since a link to it may outlive it.
 */
export const draft = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    const row = await draftOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      userId: context.actor.userId,
      id: input.id,
    });
    if (!row) return null;
    if (row.threadId) return { reply: true as const, threadId: row.threadId };
    const kind = row.kind ?? "direct";
    const [people, [student]] = await Promise.all([
      row.recipientIds.length
        ? recipientsFor(context, {
            q: "",
            limit: 50,
            after: null,
            ids: row.recipientIds,
          })
        : Promise.resolve({ rows: [], next: null }),
      row.studentId
        ? namesOf(context.tx, context.tenantId, [row.studentId])
        : Promise.resolve([]),
    ]);
    const reached = new Map(
      people.rows.map((person) => [person.userId, person]),
    );
    return {
      reply: false as const,
      id: row.id,
      version: row.version,
      kind,
      recipients: row.recipientIds.flatMap((userId) => {
        const person = reached.get(userId);
        return person ? [person] : [];
      }),
      student: student
        ? {
            id: student.id,
            fullNameEn: student.fullNameEn,
            fullNameAr: student.fullNameAr,
          }
        : null,
      subject: row.subject ?? "",
      content: (row.content ??
        plainContent(row.body)) as unknown as ContentDocument,
      updatedAt: row.updatedAt,
    };
  });

/** Deletes a draft at the version its writer read. */
export const discardDraft = writeProcedure
  .input(draftRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    if (
      !(await consumeDraft(context.tx, {
        tenantId: context.tenantId,
        userId: context.actor.userId,
        id: input.id,
        version: input.version,
      }))
    )
      throw draftConflict();
    return { discarded: true };
  });

/** A group's owner brings people in or takes them out. */
export const members = writeProcedure
  .input(membersSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "messages:send");
    const { thread: row, me } = await openThread(context, input.threadId);
    if (row.kind !== "group" || me?.role !== "owner")
      throw new ORPCError("FORBIDDEN");
    const outside = await unreachableFor(context, input.add);
    if (outside.length)
      throw new ORPCError("FORBIDDEN", { message: "messages.recipient" });
    await addMembers(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      userIds: input.add,
      role: "member",
    });
    const removed = await removeMembers(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      userIds: input.remove.filter((userId) => userId !== context.actor.userId),
    });
    await audit(context, {
      action: "message_thread.members",
      objectType: "message_thread",
      objectId: row.id,
      details: { added: input.add, removed },
    });
    return { added: input.add.length, removed };
  });

/**
 * Lets mail the conversation held back in as the family's message, when
 * the team knows it is theirs: from another address of theirs, or from
 * theirs when a check failed. It becomes the outside contact's message as
 * if it had arrived trusted, telling whoever such a message tells and
 * never emailed back to them; the held entry stays, naming what it became.
 */
export const acceptHeld = writeProcedure
  .input(acceptHeldSchema)
  .handler(async ({ input, context }) => {
    const opened = await openThread(context, input.threadId);
    const { thread: row, team, writes } = opened;
    if (!team || !writes) throw new ORPCError("FORBIDDEN");
    const outside = opened.members.filter(
      (member) => member.contactId !== null && member.role === "member",
    );
    const entryId = Bun.randomUUIDv7();
    const held = await takeHeld(context.tx, {
      tenantId: context.tenantId,
      threadId: row.id,
      id: input.entryId,
      acceptedAs: entryId,
      acceptedBy: context.actor.userId,
    });
    if (!held)
      throw new ORPCError("CONFLICT", { message: "messages.not_held" });
    const contact = input.contactId
      ? outside.find((member) => member.contactId === input.contactId)
      : (outside.find(
          (member) =>
            member.email !== null && member.email === held.from.toLowerCase(),
        ) ?? (outside.length === 1 ? outside[0] : undefined));
    if (!contact?.contactId)
      throw new ORPCError("BAD_REQUEST", { message: "messages.which_contact" });
    const posted = await writeEntry(scopeOf(context), {
      id: entryId,
      threadId: row.id,
      kind: "message",
      authorUserId: null,
      authorContactId: contact.contactId,
      content: (held.content ??
        plainContent(held.body || "-")) as unknown as ContentDocument,
      details: { acceptedFrom: held.id },
    });
    await audit(context, {
      action: "message.accept_held",
      objectType: "message",
      objectId: posted.id,
      details: {
        held: held.id,
        threadId: row.id,
        contactId: contact.contactId,
      },
    });
    return { id: posted.id };
  });

/** Contacts are the business of the teams that write to them. */
function contactTeams(context: UnitContext) {
  const { writes } = mailboxesFor(context);
  if (writes.length === 0) throw new ORPCError("FORBIDDEN");
  return writes;
}

/**
 * The outside contacts in conversations of the mailboxes the viewer
 * writes in, to find the other address a family wrote from.
 */
export const contacts = readProcedure
  .input(contactsQuerySchema)
  .handler(async ({ input, context }) => ({
    rows: await mailboxContacts(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      mailboxes: contactTeams(context),
      q: input.q,
      limit: 30,
    }),
  }));

/**
 * One family that wrote from two addresses becomes one contact: the
 * other's conversations and what it wrote become the kept contact's, and
 * mail from either address reaches the family. Both must be in
 * conversations of a mailbox the viewer writes in.
 */
export const mergeContacts = writeProcedure
  .input(mergeContactsSchema)
  .handler(async ({ input, context }) => {
    const found = await mailboxContacts(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      mailboxes: contactTeams(context),
      q: "",
      ids: [input.intoId, input.fromId],
      limit: 2,
    });
    if (found.length !== 2 || input.intoId === input.fromId)
      throw new ORPCError("NOT_FOUND");
    const merged = await mergeContactRows(context.tx, {
      tenantId: context.tenantId,
      fromId: input.fromId,
      intoId: input.intoId,
    });
    if (!merged.merged)
      throw new ORPCError("CONFLICT", {
        message:
          merged.reason === "linked_apart"
            ? "messages.merge_linked_apart"
            : "messages.merge_gone",
      });
    await audit(context, {
      action: "message_contact.merge",
      objectType: "message_contact",
      objectId: input.intoId,
      details: {
        from: input.fromId,
        conversations: merged.conversations,
        entries: merged.entries,
      },
    });
    return { conversations: merged.conversations, entries: merged.entries };
  });

/**
 * A ticket to the conversation's presence room, where staff who may write
 * in it say whether they are writing a reply, so a colleague sees someone
 * is replying before answering too. Nothing is stored, and a family is
 * never in the room.
 */
export const presence = writeProcedure
  .input(v.object({ threadId: id }))
  .handler(async ({ input, context }) => {
    const { thread: row, writes } = await openThread(context, input.threadId);
    if (!writes || !isStaff(context)) throw new ORPCError("NOT_FOUND");
    const ticket = {
      tenantId: context.tenantId,
      documentId: row.id,
      userId: context.actor.userId,
      access: "read" as const,
      room: "presence" as const,
      expiresAt: Math.floor(context.now.getTime() / 1000) + TICKET_TTL_SECONDS,
    };
    return {
      room: roomOf(ticket),
      token: await signTicket(ticket, context.cellSecret),
    };
  });
