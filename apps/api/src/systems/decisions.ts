import type { ApplicationRow } from "@faridalms/database/stores/admissions";

import { capabilityHolders } from "@faridalms/database/stores/access";
import {
  boardOf,
  decideApplication,
  eventsOf,
  funnelRows,
  insertDeferred,
  insertEvent,
  recordEventOutcome,
  reopenApplication,
  seatsOf,
  stageTimes,
  updateEvent,
} from "@faridalms/database/stores/admission-decisions";
import {
  insertApplicationEntry,
  intakesOf,
  itemsOf,
  nextReferenceCount,
  setItemState,
} from "@faridalms/database/stores/admissions";
import { schoolYears } from "@faridalms/database/stores/years";
import {
  admissionReportSchema,
  answerOfferSchema,
  applicationReference,
  boardSchema,
  canMove,
  convertSchema,
  decideSchema,
  deferApplicationSchema,
  FUNNEL_STAGES,
  placesLeft,
  prioritiesFound,
  prioritiesMet,
  rankWaitlist,
  recordEventSchema,
  releaseDue,
  releaseSchema,
  saveEventSchema,
  stageReached,
} from "@faridalms/domain/admissions";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { intakeOf } from "../core/admissions";
import {
  admissionScope,
  applicationIn,
  DecisionConflict,
  moveApplication,
  offerPlaces,
  releaseDecisions,
} from "../core/decisions";
import { enrol } from "../core/enrolment";
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

const org = (context: UnitContext) => ({
  tenantId: context.tenantId,
  orgId: context.schoolId,
});

const deciding = (context: UnitContext) =>
  requireCapability(context, "admissions:decide");

async function rowOf(context: UnitContext, id: string) {
  const row = await applicationIn(admissionScope(context), id);
  if (!row) throw new ORPCError("NOT_FOUND");
  return row;
}

/** Runs a decision's work, turning a row that changed meanwhile into the usual stale-write answer. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DecisionConflict) throw conflict();
    throw error;
  }
}

/** The places of an intake as its board shows them. */
function places(
  capacity: number,
  seats: { accepted: number; offered: number; toOffer: number } | undefined,
) {
  const counted = seats ?? { accepted: 0, offered: 0, toOffer: 0 };
  return {
    capacity,
    accepted: counted.accepted,
    offered: counted.offered,
    toOffer: counted.toOffer,
    left: placesLeft({ capacity, ...counted }),
  };
}

/**
 * One intake's applications by phase, with its places: seats less the
 * offers accepted and the offers open. The waiting list is in the order
 * places are offered, by the intake's priority rules and then age.
 */
export const board = readProcedure
  .input(boardSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:read", "admissions:manage");
    const intake = await intakeOf(context, input.intake);
    const [rows, seats, years, siblings] = await Promise.all([
      boardOf(context.tx, { ...org(context), intakeId: intake.id }),
      seatsOf(context.tx, {
        tenantId: context.tenantId,
        intakeIds: [intake.id],
      }),
      schoolYears(context.tx, context.tenantId, context.schoolId),
      intakesOf(context.tx, {
        ...org(context),
        yearId: intake.schoolYearId,
      }),
    ]);
    const ranked = rankWaitlist(
      rows.filter((row) => row.state === "waitlisted"),
      intake.priorities,
    );
    return {
      intake: {
        id: intake.id,
        gradeEn: intake.gradeEn,
        gradeAr: intake.gradeAr,
        yearTitleEn: intake.yearTitleEn,
        yearTitleAr: intake.yearTitleAr,
        schoolYearId: intake.schoolYearId,
        opensOn: intake.opensOn,
        closesOn: intake.closesOn,
        decisionsOn: intake.decisionsOn,
        offerDays: intake.offerDays,
        released: releaseDue(intake, context.today),
      },
      places: places(intake.capacity, seats.get(intake.id)),
      applications: rows.map((row) => ({
        ...row,
        rank:
          row.state === "waitlisted"
            ? ranked.findIndex((each) => each.id === row.id) + 1
            : null,
      })),
      intakes: siblings.map((each) => ({
        id: each.id,
        gradeEn: each.gradeEn,
        gradeAr: each.gradeAr,
      })),
      years: years
        .filter((year) => year.lifecycle !== "closed")
        .map((year) => ({
          id: year.id,
          titleEn: year.titleEn,
          titleAr: year.titleAr,
        })),
      today: context.today,
      manages: can(context, "admissions:manage"),
      decides: can(context, "admissions:decide"),
      configures: can(context, "admissions:configure"),
    };
  });

/**
 * Decides applications under review, or changes decisions not yet
 * released. Nothing reaches the family until release, which happens at
 * once when the intake's day has already come.
 */
export const decide = writeProcedure
  .input(decideSchema)
  .handler(async ({ input, context }) => {
    deciding(context);
    const scope = admissionScope(context);
    const decided: { row: ApplicationRow; expectedVersion: number }[] = [];
    for (const each of input.applications) {
      const row = await rowOf(context, each.id);
      if (row.state !== "in_review" && row.state !== "decided")
        throw new ORPCError("CONFLICT", {
          message: "application.state",
          data: { applicationId: row.id },
        });
      const version = await decideApplication(context.tx, {
        ...org(context),
        id: row.id,
        expectedVersion: each.expectedVersion,
        decision: input.decision,
        userId: context.actor.userId,
      });
      if (version === null) throw conflict();
      const details = {
        from: row.state,
        to: "decided",
        decision: input.decision,
      };
      await insertApplicationEntry(context.tx, {
        ...org(context),
        applicationId: row.id,
        kind: "state",
        body: input.note,
        details,
        authorUserId: context.actor.userId,
      });
      await audit(context, {
        action: "admission_application.decide",
        objectType: "admission_application",
        objectId: row.id,
        subjectUserId: row.applicantUserId,
        details,
      });
      const intake = await intakeOf(context, row.intakeId);
      if (releaseDue(intake, context.today)) {
        const now = await rowOf(context, row.id);
        decided.push({ row: now, expectedVersion: version });
      }
    }
    const released = await guarded(() =>
      releaseDecisions(scope, decided, "clock"),
    );
    return { decided: input.applications.length, released: released.released };
  });

/** Takes back a decision before it is released; the application is under review again. */
export const reopen = writeProcedure
  .input(releaseSchema)
  .handler(async ({ input, context }) => {
    deciding(context);
    for (const each of input.applications) {
      const row = await rowOf(context, each.id);
      if (!canMove(row.state, "in_review", "office"))
        throw new ORPCError("CONFLICT", { message: "application.state" });
      const version = await reopenApplication(context.tx, {
        ...org(context),
        id: row.id,
        expectedVersion: each.expectedVersion,
      });
      if (version === null) throw conflict();
      const details = { from: row.state, to: "in_review", reopened: true };
      await insertApplicationEntry(context.tx, {
        ...org(context),
        applicationId: row.id,
        kind: "state",
        body: "",
        details,
        authorUserId: context.actor.userId,
      });
      await audit(context, {
        action: "admission_application.state",
        objectType: "admission_application",
        objectId: row.id,
        subjectUserId: row.applicantUserId,
        details,
      });
    }
    return { reopened: input.applications.length };
  });

/**
 * Releases decisions before the intake's day: offers, places on the
 * waiting list and refusals reach the families with their letters. An
 * offer the intake has no place for refuses the whole release.
 */
export const release = writeProcedure
  .input(releaseSchema)
  .handler(async ({ input, context }) => {
    deciding(context);
    const wanted: { row: ApplicationRow; expectedVersion: number }[] = [];
    for (const each of input.applications) {
      const row = await rowOf(context, each.id);
      if (row.state !== "decided")
        throw new ORPCError("CONFLICT", {
          message: "application.state",
          data: { applicationId: row.id },
        });
      wanted.push({ row, expectedVersion: each.expectedVersion });
    }
    const result = await guarded(() =>
      releaseDecisions(admissionScope(context), wanted, "office"),
    );
    if (result.full.length > 0)
      throw new ORPCError("CONFLICT", {
        message: "admissions.full",
        data: { count: result.full.length },
      });
    return { released: result.released };
  });

/** Offers places from the waiting list, while the intake has places left. */
export const offer = writeProcedure
  .input(releaseSchema)
  .handler(async ({ input, context }) => {
    deciding(context);
    const wanted: { row: ApplicationRow; expectedVersion: number }[] = [];
    for (const each of input.applications) {
      const row = await rowOf(context, each.id);
      if (
        !canMove(row.state, "offered", "office") ||
        row.state !== "waitlisted"
      )
        throw new ORPCError("CONFLICT", {
          message: "application.state",
          data: { applicationId: row.id },
        });
      wanted.push({ row, expectedVersion: each.expectedVersion });
    }
    const result = await guarded(() =>
      offerPlaces(admissionScope(context), wanted),
    );
    if (result.full)
      throw new ORPCError("CONFLICT", {
        message: "admissions.full",
        data: { count: wanted.length - result.offered.length },
      });
    return { offered: result.offered };
  });

/** Closes a place on the waiting list with a refusal, when the intake's year is filled. */
export const refuse = writeProcedure
  .input(releaseSchema)
  .handler(async ({ input, context }) => {
    deciding(context);
    for (const each of input.applications) {
      const row = await rowOf(context, each.id);
      if (row.state !== "waitlisted")
        throw new ORPCError("CONFLICT", { message: "application.state" });
      const version = await moveApplication(admissionScope(context), {
        row,
        intake: await intakeOf(context, row.intakeId),
        to: "declined_by_school",
        expectedVersion: each.expectedVersion,
        details: { from_waitlist: true },
      });
      if (version === null) throw conflict();
    }
    return { refused: input.applications.length };
  });

/** Records the answer a family gave the office to an offer, by phone or at the desk. */
export const answer = writeProcedure
  .input(answerOfferSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await rowOf(context, input.id);
    const to = input.answer === "accept" ? "accepted" : "offer_declined";
    if (!canMove(row.state, to, "office"))
      throw new ORPCError("CONFLICT", { message: "application.state" });
    const version = await moveApplication(admissionScope(context), {
      row,
      intake: await intakeOf(context, row.intakeId),
      to,
      expectedVersion: input.expectedVersion,
      note: input.note,
      answered: true,
      details: { onBehalf: true },
    });
    if (version === null) throw conflict();
    return { version };
  });

/**
 * Moves an application to an intake of a later year, where it carries on
 * as sent with its new year's number and checklist; this one ends deferred.
 */
export const defer = writeProcedure
  .input(deferApplicationSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await rowOf(context, input.id);
    if (!canMove(row.state, "deferred", "office"))
      throw new ORPCError("CONFLICT", { message: "application.state" });
    const [from, to] = await Promise.all([
      intakeOf(context, row.intakeId),
      intakeOf(context, input.intakeId),
    ]);
    if (to.yearStartsOn <= from.yearStartsOn)
      throw new ORPCError("BAD_REQUEST", { message: "defer.later_year" });
    const prefix = String(to.entryYear);
    const reference = applicationReference(
      to.entryYear,
      await nextReferenceCount(context.tx, { ...org(context), prefix }),
    );
    const moved = await insertDeferred(context.tx, {
      ...org(context),
      fromId: row.id,
      intakeId: to.id,
      reference,
      priorities: prioritiesMet(
        to.priorities,
        prioritiesFound(
          {
            students: row.matches.students ?? [],
            guardians: row.matches.guardians ?? [],
            siblings: row.matches.siblings ?? [],
            staffParent: row.matches.staffParent ?? false,
          },
          row.additionalNeeds,
        ),
      ),
      checklist: to.checklist,
    });
    await insertApplicationEntry(context.tx, {
      ...org(context),
      applicationId: moved.id,
      kind: "state",
      body: input.note,
      details: { from: "deferred", to: "submitted", deferredFrom: row.id },
      authorUserId: context.actor.userId,
    });
    await audit(context, {
      action: "admission_application.create",
      objectType: "admission_application",
      objectId: moved.id,
      subjectUserId: row.applicantUserId,
      details: { intakeId: to.id, deferredFrom: row.id, reference },
    });
    const version = await moveApplication(admissionScope(context), {
      row,
      intake: from,
      to: "deferred",
      expectedVersion: input.expectedVersion,
      note: input.note,
      details: { deferredTo: moved.id, intakeId: to.id },
      gradeName: {
        en:
          to.gradeEn && to.yearTitleEn
            ? `${to.gradeEn}, ${to.yearTitleEn}`
            : to.gradeEn,
        ar:
          to.gradeAr && to.yearTitleAr
            ? `${to.gradeAr}، ${to.yearTitleAr}`
            : to.gradeAr,
      },
    });
    if (version === null) throw conflict();
    return { id: moved.id, reference, version };
  });

/**
 * Enrols accepted applicants, one or many in one transaction: each becomes
 * a student placed for the intake's year and grade, or all of them stay
 * as they were.
 */
export const convert = writeProcedure
  .input(convertSchema)
  .handler(async ({ input, context }) => {
    deciding(context);
    const enrolled = [];
    for (const each of input.applications) {
      const row = await rowOf(context, each.id);
      enrolled.push({
        applicationId: row.id,
        ...(await enrol(context, {
          row,
          intake: await intakeOf(context, row.intakeId),
          expectedVersion: each.expectedVersion,
          studentId: each.studentId,
          reference: each.reference,
        })),
      });
    }
    return { enrolled };
  });

/** Who may be asked to attend a tour, an assessment or an interview: the people who work admissions. */
export const attendees = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "admissions:manage");
  const rows = await capabilityHolders(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    capability: "admissions:manage",
  });
  return rows;
});

/** Books a tour, assessment or interview for an application, or moves one still to happen. */
export const saveEvent = writeProcedure
  .input(saveEventSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await rowOf(context, input.applicationId);
    if (row.state === "draft" || row.studentUserId !== null)
      throw new ORPCError("CONFLICT", { message: "application.state" });
    if (input.itemId) {
      const item = (
        await itemsOf(context.tx, {
          tenantId: context.tenantId,
          applicationIds: [row.id],
        })
      ).find((each) => each.id === input.itemId);
      if (!item || (item.kind !== "assessment" && item.kind !== "interview"))
        throw new ORPCError("BAD_REQUEST", { message: "event.item" });
    }
    const team = new Set(
      (
        await capabilityHolders(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          today: context.today,
          capability: "admissions:manage",
        })
      ).map((each) => each.id),
    );
    if (input.attendeeIds.some((id) => !team.has(id)))
      throw new ORPCError("BAD_REQUEST", { message: "event.attendee" });
    const fields = {
      itemId: input.itemId || null,
      kind: input.kind,
      startsOn: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location,
      attendeeIds: [...new Set(input.attendeeIds)],
    };
    let id = input.id;
    let version: number | null;
    if (id) {
      version = await updateEvent(context.tx, {
        ...org(context),
        applicationId: row.id,
        id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (version === null) throw conflict();
    } else {
      const created = await insertEvent(context.tx, {
        ...org(context),
        applicationId: row.id,
        ...fields,
      });
      id = created.id;
      version = created.version;
    }
    const details = {
      eventId: id,
      kind: input.kind,
      date: input.date,
      startTime: input.startTime,
      to: "scheduled",
    };
    await insertApplicationEntry(context.tx, {
      ...org(context),
      applicationId: row.id,
      kind: "event",
      body: "",
      details,
      authorUserId: context.actor.userId,
    });
    await audit(context, {
      action: input.id ? "admission_event.update" : "admission_event.create",
      objectType: "admission_event",
      objectId: id,
      subjectUserId: row.applicantUserId,
      details: { applicationId: row.id, kind: input.kind, date: input.date },
    });
    await notify(
      context,
      fields.attendeeIds.filter((each) => each !== context.actor.userId),
      {
        kind: "reminder",
        subject: { type: "admission_application", id: row.id },
        params: {
          title: row.applicant.nameEn ?? row.applicant.nameAr ?? "",
          titleAr: row.applicant.nameAr ?? undefined,
          date: input.date,
        },
      },
    );
    return { id, version };
  });

/**
 * Records what came of an event: attended, missed or called off, with the
 * office's notes. An attended assessment or interview has its step in.
 */
export const recordEvent = writeProcedure
  .input(recordEventSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:manage");
    const row = await rowOf(context, input.applicationId);
    const event = (
      await eventsOf(context.tx, {
        tenantId: context.tenantId,
        applicationIds: [row.id],
      })
    ).find((each) => each.id === input.id);
    if (!event) throw new ORPCError("NOT_FOUND");
    const version = await recordEventOutcome(context.tx, {
      ...org(context),
      applicationId: row.id,
      id: event.id,
      expectedVersion: input.expectedVersion,
      outcome: input.outcome,
      result: input.result,
    });
    if (version === null) throw conflict();
    if (input.outcome === "attended" && event.itemId) {
      const item = (
        await itemsOf(context.tx, {
          tenantId: context.tenantId,
          applicationIds: [row.id],
        })
      ).find((each) => each.id === event.itemId);
      if (item && (item.state === "pending" || item.state === "rejected")) {
        await setItemState(context.tx, {
          tenantId: context.tenantId,
          applicationId: row.id,
          id: item.id,
          from: [item.state],
          state: "received",
        });
        await insertApplicationEntry(context.tx, {
          ...org(context),
          applicationId: row.id,
          kind: "item",
          body: "",
          details: {
            itemId: item.id,
            labelEn: item.labelEn,
            labelAr: item.labelAr,
            from: item.state,
            to: "received",
            eventId: event.id,
          },
          authorUserId: context.actor.userId,
        });
      }
    }
    const details = { eventId: event.id, kind: event.kind, to: input.outcome };
    await insertApplicationEntry(context.tx, {
      ...org(context),
      applicationId: row.id,
      kind: "event",
      body: input.result,
      details,
      authorUserId: context.actor.userId,
    });
    await audit(context, {
      action: "admission_event.record",
      objectType: "admission_event",
      objectId: event.id,
      subjectUserId: row.applicantUserId,
      details: { applicationId: row.id, outcome: input.outcome },
    });
    return { version };
  });

/**
 * A year's admissions in numbers: how far applications got, by stage,
 * where families came from, grade and intake, and how long applications
 * stay in each state.
 */
export const reports = readProcedure
  .input(admissionReportSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "admissions:read", "admissions:manage");
    const years = (
      await schoolYears(context.tx, context.tenantId, context.schoolId)
    ).filter((year) => year.lifecycle !== "closed");
    const yearId =
      input.year ||
      years.findLast((year) => year.lifecycle === "upcoming")?.id ||
      years[0]?.id ||
      null;
    const [rows, times, intakes] = yearId
      ? await Promise.all([
          funnelRows(context.tx, { ...org(context), yearId }),
          stageTimes(context.tx, { ...org(context), yearId }),
          intakesOf(context.tx, { ...org(context), yearId }),
        ])
      : [[], [], []];
    const reached = rows.map((row) => ({
      ...row,
      stage: stageReached([...row.states, row.state]),
    }));
    const funnel = (subset: typeof reached) =>
      FUNNEL_STAGES.map((stage, index) => ({
        stage,
        count: subset.filter(
          (row) => row.stage && FUNNEL_STAGES.indexOf(row.stage) >= index,
        ).length,
      }));
    const origins = [...new Set(reached.map((row) => row.origin))].toSorted(
      (a, b) => a.localeCompare(b),
    );
    return {
      yearId,
      years: years.map((year) => ({
        id: year.id,
        titleEn: year.titleEn,
        titleAr: year.titleAr,
      })),
      total: reached.length,
      funnel: funnel(reached),
      byIntake: intakes.map((intake) => ({
        intakeId: intake.id,
        gradeEn: intake.gradeEn,
        gradeAr: intake.gradeAr,
        capacity: intake.capacity,
        funnel: funnel(reached.filter((row) => row.intakeId === intake.id)),
      })),
      byOrigin: origins.map((origin) => ({
        origin,
        funnel: funnel(reached.filter((row) => row.origin === origin)),
      })),
      times,
    };
  });
