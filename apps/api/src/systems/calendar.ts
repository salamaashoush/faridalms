import type { Scope } from "@faridalms/database/stores/students";
import type { AudienceInput } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";

import {
  audiencesOf,
  audienceUsers,
  reachOf,
  setAudiences,
} from "@faridalms/database/stores/audiences";
import {
  classesTaughtBy,
  teachesClass,
} from "@faridalms/database/stores/classes";
import { documentOf, saveDocument } from "@faridalms/database/stores/documents";
import {
  eventById,
  eventReaches,
  eventsBetween,
  insertEvent,
  publishEvent,
  removeEvent,
  setCancelled,
  specialDays,
  updateEvent,
} from "@faridalms/database/stores/events";
import { childrenOf } from "@faridalms/database/stores/persons";
import { schoolYears, workingYear } from "@faridalms/database/stores/years";
import {
  cancelEventSchema,
  eventRefSchema,
  publishEventSchema,
  rangeQuerySchema,
  saveEventSchema,
} from "@faridalms/domain/calendar";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { audienceChoices, audienceOf, calendarReach } from "../core/audiences";
import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { registerHostReader } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

const manages = (context: UnitContext) => can(context, "calendar:manage");

function teachingScope(context: UnitContext): Scope {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide: can(context, "classes:manage"),
  };
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
      !(await teachesClass(
        context.tx,
        teachingScope(context),
        audience.classId,
      ))
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

/**
 * Who the viewer is to the audiences, narrowed to one of their children when
 * a family asks: that child's classes and grade, and what goes to every
 * student or family.
 */
async function reachFor(context: UnitContext, childId: string) {
  const children = can(context, "children:read")
    ? await childrenOf(
        context.tx,
        { ...teachingScope(context), schoolWide: false },
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
    const [events, days] = await Promise.all([
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
    ]);
    return {
      events,
      days,
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
    const [audiences, description] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "calendar_event",
        id: row.id,
      }),
      documentOf(context.tx, context.tenantId, {
        type: "calendar_event",
        id: row.id,
      }),
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
      description: (description?.content ??
        null) as unknown as ContentDocument | null,
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
    if (input.id) {
      const row = await editable(context, input.id);
      told = row.state === "published" && input.sendUpdate;
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
    await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host: { type: "calendar_event", id: eventId },
      content: input.description,
      plainText: contentPlainText(input.description),
      mediaIds: contentFileIds(input.description),
      userId: context.actor.userId,
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
    });
    return { id: eventId, version };
  });

/** Puts a draft on its audience's calendar, telling them now or letting it appear quietly. */
export const publish = writeProcedure
  .input(publishEventSchema)
  .handler(async ({ input, context }) => {
    const row = await editable(context, input.id);
    const version = await publishEvent(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
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
