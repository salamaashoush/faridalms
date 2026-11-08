import type { ApplicationMatches } from "@faridalms/domain/admissions";

import {
  deferredFrom,
  eventsOf,
  lettersOf,
} from "@faridalms/database/stores/admission-decisions";
import {
  applicationById,
  applicationEntries,
  formVersionById,
  insertApplicationEntry,
  intakesOf,
  itemsOf,
  listApplications,
  setApplicationState,
  setItemState,
} from "@faridalms/database/stores/admissions";
import { currentAnswers } from "@faridalms/database/stores/consents";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { filesOfHosts } from "@faridalms/database/stores/files";
import { identifiersOf } from "@faridalms/database/stores/identifiers";
import { familyConversation } from "@faridalms/database/stores/messages";
import { reachability } from "@faridalms/database/stores/notifications";
import { person as readPerson } from "@faridalms/database/stores/students";
import { schoolYears } from "@faridalms/database/stores/years";
import {
  admissionsYear,
  ageFit,
  applicationListSchema,
  applicationNoteSchema,
  applicationRefSchema,
  attachDocumentSchema,
  canMove,
  letterRefSchema,
  moveApplicationSchema,
  moveDecides,
  moveItemSchema,
  NEEDS_KINDS,
  NO_MATCHES,
  nextApplicationStates,
  nextItemStates,
  withdrawApplicationSchema,
} from "@faridalms/domain/admissions";
import { SYSTEM_KEPT_MEANINGS } from "@faridalms/domain/identifiers";
import { paged, pageWindow } from "@faridalms/domain/paging";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { fileDocument, intakeOf, letterView } from "../core/admissions";
import { familyThread } from "../core/family-conversation";
import { readNeeds } from "../core/health";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { withPurposeFor } from "../core/purpose";
import { scopeOf } from "../messages/conversations";

const conflict = () =>
  new ORPCError("CONFLICT", { message: "conflict.version" });

const READERS = ["admissions:read", "admissions:manage"] as const;
const readsApplications = (context: UnitContext) =>
  requireCapability(context, ...READERS);

const org = (context: UnitContext) => ({
  tenantId: context.tenantId,
  orgId: context.schoolId,
});

async function applicationOf(context: UnitContext, id: string) {
  const row = await applicationById(context.tx, { ...org(context), id });
  if (!row) throw new ORPCError("NOT_FOUND");
  return row;
}

/**
 * The applications of a school year, one intake or all, in one state or
 * every live one, with the intakes to narrow by and the count in each state.
 */
export const list = readProcedure
  .input(applicationListSchema)
  .handler(async ({ input, context }) => {
    readsApplications(context);
    const years = (
      await schoolYears(context.tx, context.tenantId, context.schoolId)
    ).filter((year) => year.lifecycle !== "closed");
    const yearId =
      input.year || admissionsYear(years, context.today)?.id || null;
    const [listed, intakes] = await Promise.all([
      listApplications(context.tx, {
        ...org(context),
        query: input,
        yearId: input.intake ? null : yearId,
        ...pageWindow(input.page),
      }),
      yearId ? intakesOf(context.tx, { ...org(context), yearId }) : [],
    ]);
    return {
      ...listed,
      ...paged(listed.rows, listed.total, input.page),
      yearId,
      years: years.map((year) => ({
        id: year.id,
        titleEn: year.titleEn,
        titleAr: year.titleAr,
      })),
      intakes: intakes.map((intake) => ({
        id: intake.id,
        gradeEn: intake.gradeEn,
        gradeAr: intake.gradeAr,
        capacity: intake.capacity,
        live: intake.live,
      })),
      manages: can(context, "admissions:manage"),
    };
  });

function label(
  vocabulary: { id: string; labelEn: string | null; labelAr: string | null }[],
  id: string | null | undefined,
) {
  const found = vocabulary.find((each) => each.id === id);
  return found ? { labelEn: found.labelEn, labelAr: found.labelAr } : null;
}

function matchesOf(row: { matches: Partial<ApplicationMatches> }) {
  return {
    students: row.matches.students ?? NO_MATCHES.students,
    guardians: row.matches.guardians ?? NO_MATCHES.guardians,
    siblings: row.matches.siblings ?? NO_MATCHES.siblings,
    staffParent: row.matches.staffParent ?? false,
  };
}

/**
 * One application with everything its page shows: the child and the
 * family, the answers as the family read them, the checklist with its
 * documents, the consents given, what matching found, the history, and
 * where it may move next. Health and needs are a separate, audited read.
 */
export const application = readProcedure
  .input(applicationRefSchema)
  .handler(async ({ input, context }) => {
    readsApplications(context);
    const row = await applicationOf(context, input.id);
    const [
      intake,
      version,
      child,
      held,
      items,
      entries,
      reach,
      answers,
      letters,
      events,
      later,
      deferred,
    ] = await Promise.all([
      intakeOf(context, row.intakeId),
      formVersionById(context.tx, {
        tenantId: context.tenantId,
        id: row.formVersionId,
      }),
      readPerson(context.tx, row.applicantUserId),
      identifiersOf(context.tx, {
        tenantId: context.tenantId,
        userId: row.applicantUserId,
        except: SYSTEM_KEPT_MEANINGS,
      }),
      itemsOf(context.tx, {
        tenantId: context.tenantId,
        applicationIds: [row.id],
      }),
      applicationEntries(context.tx, {
        tenantId: context.tenantId,
        applicationId: row.id,
      }),
      reachability(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        userIds: [row.familyUserId],
      }),
      currentAnswers(context.tx, {
        tenantId: context.tenantId,
        studentIds: [row.applicantUserId],
      }),
      lettersOf(context.tx, {
        tenantId: context.tenantId,
        applicationIds: [row.id],
      }),
      eventsOf(context.tx, {
        tenantId: context.tenantId,
        applicationIds: [row.id],
      }),
      intakesOf(context.tx, org(context)),
      deferredFrom(context.tx, { tenantId: context.tenantId, id: row.id }),
    ]);
    if (!child) throw new ORPCError("NOT_FOUND");
    const vocabulary = (namespace: string) =>
      descriptorsFor(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        namespace,
        today: context.today,
        includeRetired: true,
      });
    const [files, sexes, relations, systems, purposes] = await Promise.all([
      filesOfHosts(context.tx, context.tenantId, {
        type: "admission_item",
        ids: items.map((item) => item.id),
      }),
      vocabulary("sex"),
      vocabulary("relation"),
      vocabulary("external_id_system"),
      vocabulary("consent_purpose"),
    ]);
    const family = reach[0];
    return {
      id: row.id,
      version: row.version,
      reference: row.reference,
      state: row.state,
      stateChangedAt: row.stateChangedAt,
      exitReason: row.exitReason,
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
      locale: row.locale,
      priorities: row.priorities,
      additionalNeeds: row.additionalNeeds,
      enquiryId: row.enquiryId,
      /** The family's conversation with admissions, drawn by Messages; null until there is one. */
      threadId: await familyConversation(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        mailbox: "admissions",
        userId: row.familyUserId,
        enquiryId: row.enquiryId,
      }),
      intake: {
        id: intake.id,
        gradeEn: intake.gradeEn,
        gradeAr: intake.gradeAr,
        yearTitleEn: intake.yearTitleEn,
        yearTitleAr: intake.yearTitleAr,
        ageCutoffOn: intake.ageCutoffOn,
        priorities: intake.priorities,
      },
      formNumber: version?.number ?? null,
      child: {
        id: child.id,
        nameEn: child.fullNameEn,
        nameAr: child.fullNameAr,
        birthDate: child.birthDate,
        sex: label(sexes, child.sexId),
        age: ageFit(
          {
            cutoffOn: intake.ageCutoffOn,
            minMonths: intake.minAgeMonths,
            maxMonths: intake.maxAgeMonths,
          },
          child.birthDate,
        ),
        documents: held.map((each) => ({
          id: each.id,
          system: label(systems, each.systemId),
          shown:
            each.identifier ?? (each.last4 ? `•••• ${each.last4}` : "••••••••"),
          issuingCountry: each.issuingCountry,
        })),
      },
      family: {
        id: row.familyUserId,
        nameEn: row.family.nameEn,
        nameAr: row.family.nameAr,
        email: family?.email ?? null,
        phone: family?.phone ?? null,
        relation: label(relations, row.form.relationId),
        responsible: row.form.responsible,
      },
      other: row.form.other
        ? {
            relation: label(relations, row.form.other.relationId),
            names: row.form.other.names,
            email: row.form.other.email,
            phone: row.form.other.phone,
            livesWithChild: row.form.other.livesWithChild,
          }
        : null,
      schools: row.form.schools,
      answers: row.answers,
      consents: answers.map((answer) => ({
        purpose: label(purposes, answer.purposeId),
        decision: answer.decision,
        givenOn: answer.givenOn,
        givenByEn: answer.givenByEn,
        givenByAr: answer.givenByAr,
      })),
      items: items.map((item) => ({
        id: item.id,
        version: item.version,
        kind: item.kind,
        labelEn: item.labelEn,
        labelAr: item.labelAr,
        required: item.required,
        state: item.state,
        stateChangedAt: item.stateChangedAt,
        moves: nextItemStates(item.state),
        files: files
          .filter((file) => file.hostId === item.id)
          .map((file) => ({
            id: file.id,
            name: file.name,
            mediaType: file.mediaType,
            sizeBytes: file.sizeBytes,
          })),
      })),
      matches: matchesOf(row),
      entries,
      decision: row.decision,
      decidedAt: row.decidedAt,
      releasedAt: row.releasedAt,
      offerExpiresOn: row.offerExpiresOn,
      answeredAt: row.answeredAt,
      studentId: row.studentUserId,
      deferredFromId: row.deferredFromId,
      deferredToId: deferred,
      letters,
      events,
      laterIntakes: later
        .filter((each) => each.yearStartsOn > intake.yearStartsOn)
        .map((each) => ({
          id: each.id,
          gradeEn: each.gradeEn,
          gradeAr: each.gradeAr,
          yearTitleEn: each.yearTitleEn,
          yearTitleAr: each.yearTitleAr,
        })),
      moves: nextApplicationStates(row.state, "office").filter((to) =>
        can(
          context,
          moveDecides(row.state, to)
            ? "admissions:decide"
            : "admissions:manage",
        ),
      ),
      manages: can(context, "admissions:manage"),
      decides: can(context, "admissions:decide"),
    };
  });

/** A letter the family was sent, as they read it. */
export const letter = readProcedure
  .input(letterRefSchema)
  .handler(async ({ input, context }) => {
    readsApplications(context);
    return letterView(context, input.id, null);
  });

/** The applicant's health and needs, read behind the health purpose and recorded as read. */
export const needs = readProcedure
  .input(applicationRefSchema)
  .handler(async ({ input, context }) => {
    readsApplications(context);
    const row = await applicationOf(context, input.id);
    const read = await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: row.applicantUserId,
        reason: "Read an application's health and needs",
        write: false,
        capabilities: READERS,
      },
      () => readNeeds(context, row.applicantUserId),
    );
    return Object.fromEntries(NEEDS_KINDS.map((kind) => [kind, read[kind]]));
  });

/** The office starts reading an application the family sent. */
export const move = writeProcedure
  .input(moveApplicationSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await applicationOf(context, input.id);
    // Every other move has its own procedure, which records what it needs.
    if (
      input.state !== "in_review" ||
      !canMove(row.state, input.state, "office")
    )
      throw new ORPCError("CONFLICT", { message: "application.state" });
    const version = await setApplicationState(context.tx, {
      ...org(context),
      id: row.id,
      expectedVersion: input.expectedVersion,
      from: row.state,
      state: input.state,
      exitReason: null,
    });
    if (version === null) throw conflict();
    await insertApplicationEntry(context.tx, {
      ...org(context),
      applicationId: row.id,
      kind: "state",
      body: input.note,
      details: { from: row.state, to: input.state },
      authorUserId: context.actor.userId,
    });
    await audit(context, {
      action: "admission_application.state",
      objectType: "admission_application",
      objectId: row.id,
      subjectUserId: row.applicantUserId,
      details: { from: row.state, to: input.state },
    });
    return { version };
  });

export const withdraw = writeProcedure
  .input(withdrawApplicationSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await applicationOf(context, input.id);
    if (!canMove(row.state, "withdrawn", "office"))
      throw new ORPCError("CONFLICT", { message: "application.state" });
    const version = await setApplicationState(context.tx, {
      ...org(context),
      id: row.id,
      expectedVersion: input.expectedVersion,
      from: row.state,
      state: "withdrawn",
      exitReason: input.reason,
    });
    if (version === null) throw conflict();
    await insertApplicationEntry(context.tx, {
      ...org(context),
      applicationId: row.id,
      kind: "state",
      body: input.note,
      details: { from: row.state, to: "withdrawn", reason: input.reason },
      authorUserId: context.actor.userId,
    });
    await audit(context, {
      action: "admission_application.state",
      objectType: "admission_application",
      objectId: row.id,
      subjectUserId: row.applicantUserId,
      details: { from: row.state, to: "withdrawn", reason: input.reason },
    });
    return { version };
  });

export const note = writeProcedure
  .input(applicationNoteSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await applicationOf(context, input.id);
    const written = await insertApplicationEntry(context.tx, {
      ...org(context),
      applicationId: row.id,
      kind: "note",
      body: input.body,
      authorUserId: context.actor.userId,
    });
    await audit(context, {
      action: "admission_application.note",
      objectType: "admission_application",
      objectId: row.id,
      subjectUserId: row.applicantUserId,
    });
    return written;
  });

/** The office checks a checklist step: verified, waived, not accepted, or back to waiting. */
export const moveItem = writeProcedure
  .input(moveItemSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await applicationOf(context, input.applicationId);
    if (row.state === "draft")
      throw new ORPCError("CONFLICT", { message: "application.not_sent" });
    const item = (
      await itemsOf(context.tx, {
        tenantId: context.tenantId,
        applicationIds: [row.id],
      })
    ).find((each) => each.id === input.itemId);
    if (!item) throw new ORPCError("NOT_FOUND");
    if (!nextItemStates(item.state).includes(input.state))
      throw new ORPCError("CONFLICT", { message: "application.item_state" });
    const version = await setItemState(context.tx, {
      tenantId: context.tenantId,
      applicationId: row.id,
      id: item.id,
      expectedVersion: input.expectedVersion,
      from: [item.state],
      state: input.state,
    });
    if (version === null) throw conflict();
    await insertApplicationEntry(context.tx, {
      ...org(context),
      applicationId: row.id,
      kind: "item",
      body: input.note,
      details: {
        itemId: item.id,
        labelEn: item.labelEn,
        labelAr: item.labelAr,
        from: item.state,
        to: input.state,
      },
      authorUserId: context.actor.userId,
    });
    await audit(context, {
      action: "admission_item.state",
      objectType: "admission_item",
      objectId: item.id,
      subjectUserId: row.applicantUserId,
      details: { from: item.state, to: input.state, applicationId: row.id },
    });
    return { version };
  });

/** The office files a document it was handed, such as a paper copy scanned at the desk. */
export const attach = writeProcedure
  .input(attachDocumentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await applicationOf(context, input.applicationId);
    return fileDocument(context, row, input);
  });

/**
 * The family's conversation with admissions, started now when they have
 * none: one of the mailbox's, with the family in it, under a subject in
 * the language they applied in.
 */
export const openConversation = writeProcedure
  .input(applicationRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await applicationOf(context, input.id);
    return {
      threadId: await familyThread(scopeOf(context), {
        id: row.id,
        familyUserId: row.familyUserId,
        enquiryId: row.enquiryId,
        locale: row.locale,
      }),
    };
  });
