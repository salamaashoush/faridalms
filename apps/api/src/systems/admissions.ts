import type { EntryDetails } from "@faridalms/database/stores/enquiries";
import type {
  EnquiryPurpose,
  EnquiryState,
  EntryKind,
} from "@faridalms/domain/enquiries";

import { capabilityHolders } from "@faridalms/database/stores/access";
import { namesOf } from "@faridalms/database/stores/coursework";
import {
  enquiryById,
  entriesOf,
  insertEntry,
  insertLoggedEnquiry,
  listEnquiries,
  markResponded,
  relatedEnquiries,
  setEnquiryAssignee,
  setEnquiryState,
} from "@faridalms/database/stores/enquiries";
import { publicSchool } from "@faridalms/database/stores/site";
import {
  addEntrySchema,
  assignEnquirySchema,
  CONTACT_ENTRIES,
  ENQUIRIES_PAGE_SIZE,
  enquiryListSchema,
  enquiryRefSchema,
  logEnquirySchema,
  moveEnquirySchema,
  nextStates,
  replySchema,
} from "@faridalms/domain/enquiries";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

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

async function entry(
  context: UnitContext,
  enquiryId: string,
  kind: EntryKind,
  body: string,
  details: EntryDetails = {},
) {
  return insertEntry(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    enquiryId,
    kind,
    body,
    details,
    authorUserId: context.actor.userId,
  });
}

/**
 * Records that the family was talked to. The first time also starts the
 * work: an open enquiry moves to in progress, and the thread says so.
 */
async function responded(context: UnitContext, enquiryId: string) {
  const { moved } = await markResponded(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    id: enquiryId,
  });
  if (moved)
    await entry(context, enquiryId, "state", "", {
      from: "open",
      to: "in_progress",
      automatic: true,
    });
}

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
 * One enquiry with everything its page shows: the family's answers, the
 * thread, the family's other enquiries, where it may move next and who may
 * hold it.
 */
export const enquiry = readProcedure
  .input(enquiryRefSchema)
  .handler(async ({ input, context }) => {
    readsEnquiries(context);
    const row = await enquiryOf(context, input.id);
    const [thread, related, staff, school] = await Promise.all([
      entriesOf(context.tx, { tenantId: context.tenantId, enquiryId: row.id }),
      relatedEnquiries(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: row.id,
        email: row.email,
        phone: row.phone,
      }),
      assignable(context),
      publicSchool(context.tx, context.schoolId),
    ]);
    return {
      ...row,
      thread,
      related,
      staff,
      moves: nextStates({
        state: row.state,
        responded: row.firstRespondedAt !== null,
        linked: row.applicantUserId !== null,
      }),
      manages: can(context, "admissions:manage"),
      canEmail: row.email !== "" && context.mail !== null,
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
    return created;
  });

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
    await entry(context, row.id, "assigned", "", {
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
    await entry(context, row.id, "state", input.note, {
      from: row.state,
      to: input.state,
      ...(input.reason ? { reason: input.reason } : {}),
    });
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

/** A note, or a call, email or meeting that happened outside the app. */
export const addEnquiryEntry = writeProcedure
  .input(addEntrySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await enquiryOf(context, input.id);
    const written = await entry(context, row.id, input.kind, input.body);
    if (CONTACT_ENTRIES.includes(input.kind)) await responded(context, row.id);
    await audit(context, {
      action: "enquiry.entry",
      objectType: "site_enquiry",
      objectId: row.id,
      details: { kind: input.kind },
    });
    return written;
  });

/**
 * Emails the family from the app, in the language chosen, and keeps the
 * words in the thread. The family's answer goes to the school's own address.
 * The email leaves last, so a failure to send records nothing.
 */
export const replyToEnquiry = writeProcedure
  .input(replySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await enquiryOf(context, input.id);
    if (!row.email)
      throw new ORPCError("BAD_REQUEST", { message: "enquiry.no_email" });
    const mail = context.mail;
    if (!mail)
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "enquiry.no_mail",
      });
    const school = await publicSchool(context.tx, context.schoolId);
    const written = await entry(context, row.id, "reply", input.body, {
      subject: input.subject,
      locale: input.locale,
      to: row.email,
      ...(input.template ? { template: input.template } : {}),
    });
    await responded(context, row.id);
    await audit(context, {
      action: "enquiry.reply",
      objectType: "site_enquiry",
      objectId: row.id,
      details: {
        locale: input.locale,
        template: input.template ?? null,
      },
    });
    try {
      await mail.send({
        to: row.email,
        subject: input.subject,
        text: input.body,
        reference: `enquiry/${written.id}`,
        ...(school?.email ? { replyTo: school.email } : {}),
      });
    } catch {
      throw new ORPCError("BAD_GATEWAY", { message: "enquiry.not_sent" });
    }
    return written;
  });
