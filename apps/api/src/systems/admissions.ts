import type {
  EnquiryEvent,
  EnquiryPurpose,
  EnquiryState,
} from "@faridalms/domain/enquiries";

import { capabilityHolders } from "@faridalms/database/stores/access";
import { namesOf } from "@faridalms/database/stores/coursework";
import {
  enquiryById,
  enquiryOfThread,
  insertLoggedEnquiry,
  listEnquiries,
  markResponded,
  openEnquiryConversation,
  relatedEnquiries,
  setEnquiryAssignee,
  setEnquiryState,
} from "@faridalms/database/stores/enquiries";
import { membersOf, setOwner } from "@faridalms/database/stores/messages";
import { publicSchool } from "@faridalms/database/stores/site";
import { plainContent } from "@faridalms/domain/content-conversion";
import {
  assignEnquirySchema,
  ENQUIRIES_PAGE_SIZE,
  enquiryListSchema,
  enquiryRefSchema,
  logEnquirySchema,
  moveEnquirySchema,
  nextStates,
} from "@faridalms/domain/enquiries";
import { LOGGED_CONTACTS } from "@faridalms/domain/messages";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";
import type { ConversationScope } from "../messages/conversations";

import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import {
  registerMailbox,
  scopeOf,
  writeEntry,
} from "../messages/conversations";

const conflict = () =>
  new ORPCError("CONFLICT", { message: "conflict.version" });

const readsEnquiries = (context: UnitContext) =>
  requireCapability(context, "admissions:read", "admissions:manage");

/** Who may hold an enquiry: the people who may work one. */
const assignable = (context: UnitContext) =>
  capabilityHolders(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    capability: "admissions:manage",
  });

async function enquiryOf(context: UnitContext, id: string) {
  const row = await enquiryById(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    id,
  });
  if (!row) throw new ORPCError("NOT_FOUND");
  return row;
}

async function holderOf(context: UnitContext, userId: string) {
  const holder = (await assignable(context)).find((row) => row.id === userId);
  if (!holder)
    throw new ORPCError("BAD_REQUEST", { message: "enquiry.assignee" });
  return holder;
}

async function actorNames(context: UnitContext) {
  const [author] = await namesOf(context.tx, context.tenantId, [
    context.actor.userId,
  ]);
  return {
    actorName: author?.fullNameEn ?? author?.fullNameAr ?? "",
    actorNameAr: author?.fullNameAr ?? author?.fullNameEn ?? "",
  };
}

/** Tells someone an enquiry was handed to them, unless they took it themselves. */
async function tellAssignee(
  context: UnitContext,
  assigneeId: string,
  enquiry: { id: string; name: string; purpose: EnquiryPurpose },
) {
  await notify(context, [assigneeId], {
    kind: "enquiry",
    subject: { type: "site_enquiry", id: enquiry.id },
    params: {
      title: enquiry.name,
      purpose: enquiry.purpose,
      assigned: true,
      ...(await actorNames(context)),
    },
    needsAction: true,
  });
}

/** The enquiry's conversation, made now for one whose arrival could not make it. */
async function conversationOf(
  context: UnitContext,
  enquiry: { id: string; threadId: string | null },
): Promise<string> {
  const threadId =
    enquiry.threadId ??
    (await openEnquiryConversation(context.tx, {
      tenantId: context.tenantId,
      enquiryId: enquiry.id,
    }));
  if (!threadId) throw new ORPCError("NOT_FOUND");
  return threadId;
}

/**
 * A change the enquiry's work records in its conversation, among the
 * messages and notes, so staff read one timeline. People hear of a change
 * on its own terms, as an assignment does, not as a message.
 */
function recordEvent(
  scope: ConversationScope,
  threadId: string,
  event: EnquiryEvent,
  note = "",
) {
  return writeEntry(scope, {
    threadId,
    kind: "event",
    authorUserId: scope.actorUserId,
    content: note ? plainContent(note) : null,
    details: event,
    notify: false,
  });
}

/**
 * Staff writing to the family, or logging a call, meeting or email with
 * them, is the family being answered: the first time sets the response
 * time, and an open enquiry is then in progress, which the conversation
 * records.
 */
registerMailbox("admissions", {
  written: async (scope, entry) => {
    if (entry.fromOutside || !entry.authorUserId) return;
    if (
      entry.kind !== "message" &&
      !(LOGGED_CONTACTS as readonly string[]).includes(entry.kind)
    )
      return;
    const enquiry = await enquiryOfThread(scope.tx, {
      tenantId: scope.tenantId,
      threadId: entry.threadId,
    });
    if (!enquiry) return;
    const { moved } = await markResponded(scope.tx, {
      tenantId: scope.tenantId,
      orgId: enquiry.orgId,
      id: enquiry.id,
    });
    if (moved)
      await recordEvent(scope, entry.threadId, {
        event: "state",
        from: "open",
        to: "in_progress",
        automatic: true,
      });
  },
});

/** The inbox: one state at a time, narrowed by source, purpose, holder and words. */
export const enquiries = readProcedure
  .input(enquiryListSchema)
  .handler(async ({ input, context }) => {
    readsEnquiries(context);
    const [list, staff] = await Promise.all([
      listEnquiries(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        viewerId: context.actor.userId,
        query: input,
        limit: ENQUIRIES_PAGE_SIZE,
        offset: (input.page - 1) * ENQUIRIES_PAGE_SIZE,
      }),
      assignable(context),
    ]);
    return {
      ...list,
      page: input.page,
      pages: Math.max(1, Math.ceil(list.total / ENQUIRIES_PAGE_SIZE)),
      staff,
      manages: can(context, "admissions:manage"),
    };
  });

/**
 * One enquiry's workflow: the family's answers, their other enquiries,
 * where it may move next and who may hold it. Its conversation, with every
 * message, note and change, is read through Messages by its thread.
 */
export const enquiry = readProcedure
  .input(enquiryRefSchema)
  .handler(async ({ input, context }) => {
    readsEnquiries(context);
    const row = await enquiryOf(context, input.id);
    const [related, staff, school, members] = await Promise.all([
      relatedEnquiries(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: row.id,
        email: row.email,
        phone: row.phone,
        phoneNormalized: row.phoneNormalized,
      }),
      assignable(context),
      publicSchool(context.tx, context.schoolId),
      row.threadId
        ? membersOf(context.tx, context.tenantId, row.threadId)
        : Promise.resolve([]),
    ]);
    return {
      ...row,
      related,
      /** The family as the conversation's outside contact, which an erasure names. */
      contactId:
        members.find((member) => member.contactId && !member.userId)
          ?.contactId ?? null,
      canErase: can(context, "erasure:approve"),
      staff,
      moves: nextStates({
        state: row.state,
        responded: row.firstRespondedAt !== null,
        linked: row.applicantUserId !== null,
      }),
      manages: can(context, "admissions:manage"),
      /** How long the family has waited for a first answer; null once they have one. */
      waitingMinutes: row.firstRespondedAt
        ? null
        : Math.max(
            0,
            Math.floor(
              (context.now.getTime() - Date.parse(row.createdAt)) / 60_000,
            ),
          ),
      school: { nameEn: school?.nameEn ?? "", nameAr: school?.nameAr ?? null },
    };
  });

/**
 * Makes an enquiry's conversation where its arrival did not, so the page
 * has one to show. Returns the conversation either way.
 */
export const openConversation = writeProcedure
  .input(enquiryRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await enquiryOf(context, input.id);
    return { threadId: await conversationOf(context, row) };
  });

/** An enquiry taken by phone, at the desk, at an event or from a referral. */
export const logEnquiry = writeProcedure
  .input(logEnquirySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const assigneeId = input.assigneeId || null;
    if (assigneeId) await holderOf(context, assigneeId);
    const created = await insertLoggedEnquiry(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      source: input.source,
      purpose: input.purpose,
      locale: input.locale,
      name: input.name,
      email: input.email,
      phone: input.phone,
      childName: input.childName,
      childYear: input.childYear,
      message: input.message,
      assigneeUserId: assigneeId,
      createdByUserId: context.actor.userId,
    });
    const threadId = await openEnquiryConversation(context.tx, {
      tenantId: context.tenantId,
      enquiryId: created.id,
    });
    await audit(context, {
      action: "enquiry.log",
      objectType: "site_enquiry",
      objectId: created.id,
      details: {
        source: input.source,
        purpose: input.purpose,
        assigned: Boolean(assigneeId),
      },
    });
    if (assigneeId)
      await tellAssignee(context, assigneeId, {
        id: created.id,
        name: input.name,
        purpose: input.purpose,
      });
    return { ...created, threadId };
  });

/** Hands an enquiry, and so its conversation, to someone or to nobody. */
export const assignEnquiry = writeProcedure
  .input(assignEnquirySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await enquiryOf(context, input.id);
    const assigneeId = input.assigneeId || null;
    const holder = assigneeId ? await holderOf(context, assigneeId) : null;
    if (assigneeId === (row.assignee?.id ?? null))
      return { version: row.version };
    const version = await setEnquiryAssignee(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      assigneeUserId: assigneeId,
    });
    if (version === null) throw conflict();
    const threadId = await conversationOf(context, row);
    await setOwner(context.tx, {
      tenantId: context.tenantId,
      threadId,
      userId: assigneeId,
    });
    await recordEvent(scopeOf(context), threadId, {
      event: "assigned",
      assigneeId,
      nameEn: holder?.nameEn ?? null,
      nameAr: holder?.nameAr ?? null,
    });
    await audit(context, {
      action: "enquiry.assign",
      objectType: "site_enquiry",
      objectId: row.id,
      details: { from: row.assignee?.id ?? null, to: assigneeId },
    });
    if (assigneeId) await tellAssignee(context, assigneeId, row);
    return { version };
  });

/** Moves an enquiry on, or back to work; closing says why. */
export const moveEnquiry = writeProcedure
  .input(moveEnquirySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await enquiryOf(context, input.id);
    const allowed: EnquiryState[] = nextStates({
      state: row.state,
      responded: row.firstRespondedAt !== null,
      linked: row.applicantUserId !== null,
    });
    if (!allowed.includes(input.state))
      throw new ORPCError("CONFLICT", { message: "enquiry.state" });
    const version = await setEnquiryState(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: input.state,
      closedReason: input.reason ?? null,
    });
    if (version === null) throw conflict();
    await recordEvent(
      scopeOf(context),
      await conversationOf(context, row),
      {
        event: "state",
        from: row.state,
        to: input.state,
        ...(input.reason ? { reason: input.reason } : {}),
      },
      input.note,
    );
    await audit(context, {
      action: "enquiry.state",
      objectType: "site_enquiry",
      objectId: row.id,
      details: {
        from: row.state,
        to: input.state,
        reason: input.reason ?? null,
      },
    });
    return { version };
  });
