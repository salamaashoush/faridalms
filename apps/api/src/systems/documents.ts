import {
  contentToRestore,
  documentOf,
  makeCollaborative,
  versionsOf,
} from "@faridalms/database/stores/documents";
import {
  signTicket,
  TICKET_TTL_SECONDS,
  roomOf,
} from "@faridalms/domain/collab";
import { lessonContentOf } from "@faridalms/domain/learning";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { readProcedure, writeProcedure } from "../core/procedure";
import { hostAccess, liveRulesOf } from "../files/authorize";

const hostSchema = v.object({
  hostType: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]{1,62}$/)),
  hostId: v.pipe(v.string(), v.uuid()),
});

/**
 * A ticket to edit a record's document live, or to watch it when the viewer
 * may only read. The host's own rules decide which; a writer's first ticket
 * turns the document collaborative.
 */
export const collaborate = writeProcedure
  .input(hostSchema)
  .handler(async ({ input, context }) => {
    const host = { type: input.hostType, id: input.hostId };
    const access = await hostAccess(context, host);
    const rules = liveRulesOf(host.type);
    if (
      !access ||
      (access === "read" && (await rules?.keyed(context, host.id)))
    )
      throw new ORPCError("NOT_FOUND");
    // A room starts from the stored content, so it is put in shape first.
    if (access === "write") await rules?.prepare?.(context, host.id);
    const document = await documentOf(context.tx, context.tenantId, host);
    if (!document) throw new ORPCError("NOT_FOUND");
    const live =
      access === "write"
        ? await makeCollaborative(context.tx, {
            tenantId: context.tenantId,
            documentId: document.id,
          })
        : false;
    if (!live && access === "write")
      throw new ORPCError("CONFLICT", { message: "documents.frozen" });
    const ticket = {
      tenantId: context.tenantId,
      documentId: document.id,
      userId: context.actor.userId,
      access,
      expiresAt: Math.floor(context.now.getTime() / 1000) + TICKET_TTL_SECONDS,
    };
    return {
      room: roomOf(ticket),
      token: await signTicket(ticket, context.cellSecret),
      access,
    };
  });

/** The record's document, for those who may change it; refused to anyone else. */
async function written(
  context: UnitContext,
  host: { type: string; id: string },
) {
  if ((await hostAccess(context, host)) !== "write")
    throw new ORPCError("NOT_FOUND");
  return documentOf(context.tx, context.tenantId, host);
}

/**
 * A document's earlier versions for those who write it: each one readers
 * were shown, the copies kept while people edit together, and the text set
 * aside before each restore.
 */
export const history = readProcedure
  .input(hostSchema)
  .handler(async ({ input, context }) => {
    const document = await written(context, {
      type: input.hostType,
      id: input.hostId,
    });
    return {
      versions: document
        ? await versionsOf(context.tx, context.tenantId, document.id)
        : [],
    };
  });

/**
 * Brings an earlier version back as the working copy, keeping what was
 * there as a version of its own; the editor saves it as any other edit, so
 * readers meet it only when it is next shown to them.
 */
export const restore = writeProcedure
  .input(
    v.object({
      ...hostSchema.entries,
      documentVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
    }),
  )
  .handler(async ({ input, context }) => {
    const document = await written(context, {
      type: input.hostType,
      id: input.hostId,
    });
    if (!document) throw new ORPCError("NOT_FOUND");
    const content = await contentToRestore(context.tx, {
      tenantId: context.tenantId,
      documentId: document.id,
      documentVersion: input.documentVersion,
      userId: context.actor.userId,
    });
    if (!content) throw new ORPCError("NOT_FOUND");
    // Lessons kept as a list of blocks before they were documents come back
    // as the document they read as today.
    return { content: lessonContentOf(content) };
  });
