import type { AudienceInput } from "@faridalms/domain/announcements";
import type { ShownCategory } from "@faridalms/domain/calendar";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import { changeOf } from "@faridalms/database/audit";
import { bookedBetween } from "@faridalms/database/stores/admission-decisions";
import {
  audiencesOf,
  audienceUsers,
  reachOf,
  setAudiences,
} from "@faridalms/database/stores/audiences";
import { classesTaughtBy } from "@faridalms/database/stores/classes";
import {
  eventById,
  eventReaches,
  eventsBetween,
  feedOf,
  insertEvent,
  publishEvent,
  removeEvent,
  resetFeed as resetFeedRow,
  setCancelled,
  specialDays,
  updateEvent,
} from "@faridalms/database/stores/events";
import { childrenOf } from "@faridalms/database/stores/persons";
import { translationReview } from "@faridalms/database/stores/translations";
import { schoolYears, workingYear } from "@faridalms/database/stores/years";
import {
  cancelEventSchema,
  eventRefSchema,
  publishEventSchema,
  rangeQuerySchema,
  saveEventSchema,
} from "@faridalms/domain/calendar";
import { CONTENT_ISSUE_CODE } from "@faridalms/domain/content-checks";
import {
  documentWritten,
  reviewTranslationSchema,
} from "@faridalms/domain/translations";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { hashFeedToken, newFeedToken } from "../calendar/feed";
import { audienceChoices, audienceOf, calendarReach } from "../core/audiences";
import { refuseIfHeld } from "../core/holds";
import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import {
  draftWords,
  publishedWords,
  publishWords,
  saveWords,
  wordsIssues,
} from "../core/publication";
import { isStaff, scopeFor, teaches } from "../core/reach";
import { checkTranslation } from "../core/translation-review";
import { registerHostReader, registerHostWriter } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

const manages = (context: UnitContext) => can(context, "calendar:manage");

const host = (eventId: string) => ({ type: "calendar_event", id: eventId });

/** The language an event's description is written in first, from its titles before it had one. */
const localeOf = (
  stored: string | null | undefined,
  row: { titleEn: string | null; titleAr: string | null },
): ContentLocale =>
  stored === "ar" || stored === "en"
    ? stored
    : row.titleAr && !row.titleEn
      ? "ar"
      : "en";

/**
 * What stops an event's description going out to its audience, by the one
 * check list and the consent of everyone its pictures show.
 */
async function checkDescription(
  context: UnitContext,
  description: readonly (ContentDocument | null)[],
) {
  const [problem] = await wordsIssues(context, description);
  if (problem)
    throw new ORPCError("BAD_REQUEST", {
      message: CONTENT_ISSUE_CODE[problem],
    });
}

/** The description its audience reads now, and the people it newly mentions told. */
function sendDescription(
  context: UnitContext,
  row: { id: string; titleEn: string | null; titleAr: string | null },
) {
  return publishWords(context, host(row.id), {
    live: true,
    title: row.titleEn ?? row.titleAr ?? "",
    ...(row.titleAr ? { titleAr: row.titleAr } : {}),
  });
}

/** An event of this school the viewer is invited to or wrote, or not found. */
async function readable(context: UnitContext, eventId: string) {
  const row = await eventById(context.tx, context.tenantId, eventId);
  if (!row || row.orgId !== context.schoolId) throw new ORPCError("NOT_FOUND");
  if (manages(context) || row.authorUserId === context.actor.userId) return row;
  const reach = await calendarReach(context);
  if (
    row.state !== "published" ||
    (reach &&
      !(await eventReaches(
        context.tx,
        { tenantId: context.tenantId, eventId: row.id },
        reach,
      )))
  )
    throw new ORPCError("NOT_FOUND");
  return row;
}

/** An event the viewer may change: any of the school's for managers, their own for authors. */
async function editable(context: UnitContext, eventId: string) {
  requireCapability(context, "calendar:manage", "calendar:author");
  const row = await eventById(context.tx, context.tenantId, eventId);
  if (!row || row.orgId !== context.schoolId) throw new ORPCError("NOT_FOUND");
  if (!manages(context) && row.authorUserId !== context.actor.userId)
    throw new ORPCError("FORBIDDEN");
  return row;
}

/**
 * Authors who do not manage the calendar may address only classes they
 * teach; the school, its staff, all families and whole grades stay with the
 * office.
 */
async function checkAudiences(
  context: UnitContext,
  audiences: readonly AudienceInput[],
) {
  if (manages(context)) return;
  for (const audience of audiences) {
    if (
      audience.scope !== "class" ||
      !(await teaches(context, "teaching", audience.classId))
    )
      throw new ORPCError("FORBIDDEN", { message: "calendar.audience" });
  }
}

/** Tells an event's audience it is new, changed or called off. */
async function tell(
  context: UnitContext,
  row: {
    id: string;
    titleEn: string | null;
    titleAr: string | null;
    startsOn: string;
  },
  change: { updated?: boolean; cancelled?: boolean },
) {
  const audiences = await audiencesOf(context.tx, context.tenantId, {
    kind: "calendar_event",
    id: row.id,
  });
  const people = await audienceUsers(
    context.tx,
    {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      on: context.today,
    },
    audiences,
  );
  return notify(context, people, {
    kind: "event",
    subject: { type: "calendar_event", id: row.id },
    params: {
      title: row.titleEn ?? row.titleAr ?? "",
      titleAr: row.titleAr ?? undefined,
      date: row.startsOn,
      ...change,
    },
    collapse: !change.cancelled,
  });
}

registerHostReader("calendar_event", async (context, hostId) => {
  try {
    await readable(context, hostId);
    return true;
  } catch {
    return false;
  }
});
registerHostWriter("calendar_event", async (context, hostId) => {
  try {
    await editable(context, hostId);
    return true;
  } catch {
    return false;
  }
});

/**
 * Who the viewer is to the audiences, narrowed to one of their children when
 * a family asks: that child's classes and grade, and what goes to every
 * student or family.
 */
async function reachFor(context: UnitContext, childId: string) {
  const children = can(context, "children:read")
    ? await childrenOf(
        context.tx,
        scopeFor(context, "own"),
        context.actor.userId,
      )
    : [];
  if (!childId) return { reach: await calendarReach(context), children };
  if (!children.some((child) => child.studentId === childId))
    throw new ORPCError("NOT_FOUND");
  const theirs = await reachOf(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    userId: childId,
    on: context.today,
  });
  return {
    reach: { ...theirs, staff: false, student: true, guardian: true },
    children,
  };
}

/** The events and the school calendar's special days within a window. */
export const range = readProcedure
  .input(rangeQuerySchema)
  .handler(async ({ input, context }) => {
    const { reach, children } = await reachFor(context, input.child);
    const admissions =
      can(context, "admissions:read") || can(context, "admissions:manage");
    const [events, days, booked] = await Promise.all([
      eventsBetween(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        viewerId: context.actor.userId,
        from: input.from,
        to: input.to,
        reach,
        drafts: true,
      }),
      specialDays(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        from: input.from,
        to: input.to,
      }),
      // A family's view of a child's calendar holds no admissions work.
      input.child || !isStaff(context)
        ? Promise.resolve([])
        : bookedBetween(context.tx, {
            tenantId: context.tenantId,
            orgId: context.schoolId,
            from: input.from,
            to: input.to,
            attendeeId: admissions ? null : context.actor.userId,
          }),
    ]);
    return {
      events: [
        ...events.map((row) => ({
          ...row,
          category: row.category as ShownCategory,
          admission: null,
        })),
        ...booked.map((row) => ({
          id: row.id,
          version: 1,
          orgId: context.schoolId,
          titleEn: row.applicantNameEn,
          titleAr: row.applicantNameAr,
          category: "admissions" as ShownCategory,
          startsOn: row.startsOn,
          endsOn: row.startsOn,
          startTime: row.startTime,
          endTime: row.endTime,
          location: row.location || null,
          provisional: false,
          cancelled: row.outcome === "cancelled",
          state: "published" as const,
          public: false,
          publishedAt: null,
          updateSentAt: null,
          authorUserId: "",
          authorNameEn: null,
          authorNameAr: null,
          admission: { applicationId: row.applicationId, kind: row.kind },
        })),
      ].toSorted(
        (a, b) =>
          a.startsOn.localeCompare(b.startsOn) ||
          (a.startTime ?? "").localeCompare(b.startTime ?? ""),
      ),
      days,
      admissions: booked.length > 0 || admissions,
      canManage: manages(context),
      canAuthor: manages(context) || can(context, "calendar:author"),
      children: children.map((child) => ({
        id: child.studentId,
        nameEn: child.fullNameEn,
        nameAr: child.fullNameAr,
      })),
    };
  });

/** The classes and grades an event can be for: every one for the office, a teacher's own classes otherwise. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "calendar:manage", "calendar:author");
  if (manages(context)) return audienceChoices(context);
  const year = workingYear(
    await schoolYears(context.tx, context.tenantId, context.schoolId),
    context.today,
  );
  if (!year) return { classes: [], grades: [] };
  const taught = await classesTaughtBy(context.tx, context, {
    userId: context.actor.userId,
    yearId: year.id,
    on: context.today,
  });
  return {
    classes: taught.map((row) => ({
      id: row.id,
      code: row.code,
      titleEn: row.titleEn,
      titleAr: row.titleAr,
      classType: row.classType,
    })),
    grades: [],
  };
});

export const event = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await readable(context, input.id);
    const canEdit =
      manages(context) ||
      (can(context, "calendar:author") &&
        row.authorUserId === context.actor.userId);
    const [audiences, draft, published, review] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "calendar_event",
        id: row.id,
      }),
      draftWords(context, host(row.id)),
      publishedWords(context, host(row.id)),
      canEdit
        ? translationReview(context.tx, {
            tenantId: context.tenantId,
            host: "calendar_event",
            id: row.id,
          })
        : null,
    ]);
    const reached = canEdit
      ? (
          await audienceUsers(
            context.tx,
            {
              tenantId: context.tenantId,
              schoolId: context.schoolId,
              on: context.today,
            },
            audiences,
          )
        ).length
      : 0;
    return {
      ...row,
      audiences: canEdit ? audiences : [],
      reached,
      // Its audience reads the description as it went out; those who can
      // change it read what they are writing.
      description: canEdit ? draft.body : (published?.body ?? null),
      translation: canEdit ? draft.other : (published?.translation ?? null),
      primaryLocale: localeOf(draft.original?.locale, row),
      translationReview: review,
      canManage: manages(context),
      canEdit,
    };
  });

export const save = writeProcedure
  .input(saveEventSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "calendar:manage", "calendar:author");
    await checkAudiences(context, input.audiences);
    const fields = {
      titleEn: input.titleEn || null,
      titleAr: input.titleAr || null,
      public: manages(context) && input.public,
      category: input.category,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      startTime: input.allDay ? null : input.startTime,
      endTime: input.allDay ? null : input.endTime,
      location: input.location || null,
      provisional: input.provisional,
    };
    let eventId = input.id;
    let version: number;
    let told = false;
    let out = false;
    const before = input.id ? await editable(context, input.id) : null;
    if (before) {
      await refuseIfHeld(context, host(before.id));
      out = before.state === "published";
      if (out)
        await checkDescription(context, [input.description, input.translation]);
      told = out && input.sendUpdate;
      const next = await updateEvent(context.tx, {
        tenantId: context.tenantId,
        id: input.id,
        expectedVersion: input.expectedVersion,
        updateSent: told,
        ...fields,
      });
      if (next === null)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      version = next;
    } else {
      const created = await insertEvent(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        authorId: context.actor.userId,
        ...fields,
      });
      eventId = created.id;
      version = created.version;
    }
    await setAudiences(context.tx, {
      tenantId: context.tenantId,
      owner: { kind: "calendar_event", id: eventId },
      audiences: input.audiences.map(audienceOf),
    });
    const words = await saveWords(context, host(eventId), {
      primaryLocale: localeOf(input.primaryLocale, input),
      body: input.description,
      translation: input.translation,
      review: "calendar_event",
    });
    if (words.version !== null) version = words.version;
    // A published event changes for its audience as it is saved.
    if (out)
      await sendDescription(context, {
        id: eventId,
        titleEn: fields.titleEn,
        titleAr: fields.titleAr,
      });
    if (told)
      await tell(
        context,
        {
          id: eventId,
          titleEn: fields.titleEn,
          titleAr: fields.titleAr,
          startsOn: input.startsOn,
        },
        { updated: true },
      );
    await audit(context, {
      action: input.id ? "calendar_event.update" : "calendar_event.create",
      objectType: "calendar_event",
      objectId: eventId,
      details: {
        title: fields.titleEn ?? fields.titleAr,
        startsOn: input.startsOn,
        told,
      },
      change: changeOf("core.calendar_events", before, fields),
    });
    return { id: eventId, version };
  });

/**
 * Records that the description's translation was checked against the
 * original as it now reads, or takes the check back.
 */
export const reviewTranslation = writeProcedure
  .input(reviewTranslationSchema)
  .handler(async ({ input, context }) => {
    const row = await editable(context, input.id);
    return checkTranslation(context, {
      host: "calendar_event",
      id: row.id,
      version: row.version,
      expectedVersion: input.expectedVersion,
      reviewed: input.reviewed,
      translated: documentWritten(
        (await draftWords(context, host(row.id))).other,
      ),
      nothingToCheck: "calendar.nothing_to_check",
    });
  });

/** Puts a draft on its audience's calendar, telling them now or letting it appear quietly. */
export const publish = writeProcedure
  .input(publishEventSchema)
  .handler(async ({ input, context }) => {
    const row = await editable(context, input.id);
    const words = await draftWords(context, host(row.id));
    await checkDescription(context, [words.body, words.other]);
    const version = await publishEvent(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await sendDescription(context, row);
    const told = input.notify ? await tell(context, row, {}) : 0;
    await audit(context, {
      action: "calendar_event.publish",
      objectType: "calendar_event",
      objectId: row.id,
      details: { told },
    });
    return { version, told };
  });

/**
 * Marks an event called off, or on again; it stays on the calendar either
 * way. Once published, its audience always hears, because a feed may take a
 * day to show the change.
 */
export const cancel = writeProcedure
  .input(cancelEventSchema)
  .handler(async ({ input, context }) => {
    const row = await editable(context, input.id);
    const published = row.state === "published";
    const version = await setCancelled(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      cancelled: input.cancelled,
      updateSent: published,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    if (published)
      await tell(
        context,
        row,
        input.cancelled ? { cancelled: true } : { updated: true },
      );
    await audit(context, {
      action: input.cancelled
        ? "calendar_event.cancel"
        : "calendar_event.restore",
      objectType: "calendar_event",
      objectId: row.id,
    });
    return { version };
  });

/**
 * Removes a draft, a past event or one already called off. A published
 * event still to come is cancelled first, so the people who saw it are told
 * rather than finding it gone.
 */
export const remove = writeProcedure
  .input(eventRefSchema)
  .handler(async ({ input, context }) => {
    const row = await editable(context, input.id);
    if (
      row.state === "published" &&
      !row.cancelled &&
      row.endsOn >= context.today
    )
      throw new ORPCError("CONFLICT", { message: "calendar.cancel_first" });
    if (
      !(await removeEvent(context.tx, {
        tenantId: context.tenantId,
        id: row.id,
        expectedVersion: input.expectedVersion,
      }))
    )
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "calendar_event.delete",
      objectType: "calendar_event",
      objectId: row.id,
      details: { title: row.titleEn ?? row.titleAr },
    });
    return { removed: true };
  });

/** Whether the viewer has a calendar link at this school, and when it was last read. */
export const feed = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "calendar:read");
  return feedOf(context.tx, {
    tenantId: context.tenantId,
    userId: context.actor.userId,
    orgId: context.schoolId,
  });
});

/**
 * Makes the viewer a new calendar link, retiring any old one at once. The
 * secret is returned this once; only its hash is kept.
 */
export const resetFeed = writeProcedure.handler(async ({ context }) => {
  requireCapability(context, "calendar:read");
  const token = newFeedToken();
  await resetFeedRow(context.tx, {
    tenantId: context.tenantId,
    userId: context.actor.userId,
    orgId: context.schoolId,
    tokenHash: hashFeedToken(token),
  });
  await audit(context, {
    action: "calendar_feed.reset",
    objectType: "user",
    objectId: context.actor.userId,
  });
  return { token, school: context.school.slug };
});
