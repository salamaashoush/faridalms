import {
  documentOf,
  makeCollaborative,
} from "@faridalms/database/stores/documents";
import {
  signTicket,
  TICKET_TTL_SECONDS,
  roomOf,
} from "@faridalms/domain/collab";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import { writeProcedure } from "../core/procedure";
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
