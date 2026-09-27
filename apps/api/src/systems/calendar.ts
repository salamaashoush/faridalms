import type { ContentDocument } from "@faridalms/domain/content";

import {
  audiencesOf,
  reachOf,
  setAudiences,
} from "@faridalms/database/stores/audiences";
import { documentOf, saveDocument } from "@faridalms/database/stores/documents";
import {
  eventById,
  eventReaches,
  eventsBetween,
  insertEvent,
  removeEvent,
  setCancelled,
  specialDays,
  updateEvent,
} from "@faridalms/database/stores/events";
import {
  cancelEventSchema,
  eventRefSchema,
  rangeQuerySchema,
  saveEventSchema,
} from "@faridalms/domain/calendar";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { audienceChoices, audienceOf } from "../core/audiences";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { registerHostReader } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

/** Who the viewer is to the audience scopes today; managers see every event. */
async function viewerReach(context: UnitContext) {
  if (can(context, "calendar:manage")) return null;
  return reachOf(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    userId: context.actor.userId,
    on: context.today,
  });
}

/** An event of this school the viewer is invited to, or not found. */
async function readable(context: UnitContext, eventId: string) {
  const row = await eventById(context.tx, context.tenantId, eventId);
  if (!row || row.orgId !== context.schoolId) throw new ORPCError("NOT_FOUND");
  const reach = await viewerReach(context);
  if (
    reach &&
    !(await eventReaches(
      context.tx,
      { tenantId: context.tenantId, eventId: row.id },
      reach,
    ))
  )
    throw new ORPCError("NOT_FOUND");
  return row;
}

registerHostReader("calendar_event", async (context, hostId) => {
  try {
    await readable(context, hostId);
    return true;
  } catch {
    return false;
  }
});

/** The events and the school calendar's special days within a window. */
export const range = readProcedure
  .input(rangeQuerySchema)
  .handler(async ({ input, context }) => {
    const reach = await viewerReach(context);
    const [events, days] = await Promise.all([
      eventsBetween(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        from: input.from,
        to: input.to,
        reach,
      }),
      specialDays(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        from: input.from,
        to: input.to,
      }),
    ]);
    return { events, days, canManage: reach === null };
  });

/** The classes and grades an event can be for. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "calendar:manage");
  return audienceChoices(context);
});

export const event = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const row = await readable(context, input.id);
    const manages = can(context, "calendar:manage");
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
    return {
      ...row,
      audiences: manages ? audiences : [],
      description: (description?.content ??
        null) as unknown as ContentDocument | null,
      canManage: manages,
    };
  });

export const save = writeProcedure
  .input(saveEventSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "calendar:manage");
    const fields = {
      title: input.title,
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
    if (input.id) {
      const row = await eventById(context.tx, context.tenantId, input.id);
      if (!row || row.orgId !== context.schoolId)
        throw new ORPCError("NOT_FOUND");
      const next = await updateEvent(context.tx, {
        tenantId: context.tenantId,
        id: input.id,
        expectedVersion: input.expectedVersion,
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
    await audit(context, {
      action: input.id ? "calendar_event.update" : "calendar_event.create",
      objectType: "calendar_event",
      objectId: eventId,
      details: { title: input.title, startsOn: input.startsOn },
    });
    return { id: eventId, version };
  });

/** Marks an event called off, or on again; it stays on the calendar either way. */
export const cancel = writeProcedure
  .input(cancelEventSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "calendar:manage");
    const row = await eventById(context.tx, context.tenantId, input.id);
    if (!row || row.orgId !== context.schoolId)
      throw new ORPCError("NOT_FOUND");
    const version = await setCancelled(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      cancelled: input.cancelled,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: input.cancelled
        ? "calendar_event.cancel"
        : "calendar_event.restore",
      objectType: "calendar_event",
      objectId: row.id,
    });
    return { version };
  });

export const remove = writeProcedure
  .input(eventRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "calendar:manage");
    const row = await eventById(context.tx, context.tenantId, input.id);
    if (!row || row.orgId !== context.schoolId)
      throw new ORPCError("NOT_FOUND");
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
      details: { title: row.title },
    });
    return { removed: true };
  });
