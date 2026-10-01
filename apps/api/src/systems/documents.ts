import {
  documentOf,
  makeCollaborative,
  saveDocument,
} from "@faridalms/database/stores/documents";
import {
  signTicket,
  TICKET_TTL_SECONDS,
  roomOf,
} from "@faridalms/domain/collab";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { lessonContentOf } from "@faridalms/domain/learning";
import { isContentDocument } from "@faridalms/domain/lesson-content";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import { writeProcedure } from "../core/procedure";
import { hostAccess } from "../files/authorize";

/**
 * Documents whose shared state holds answer keys: students read them only
 * through the blocks their own endpoints strip, never by watching the room.
 */
const KEYED_HOSTS = new Set(["lesson", "assignment_quiz"]);

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
    if (!access || (access === "read" && KEYED_HOSTS.has(host.type)))
      throw new ORPCError("NOT_FOUND");
    const document = await documentOf(context.tx, context.tenantId, host);
    if (!document) throw new ORPCError("NOT_FOUND");
    // A room starts from the stored content, which must be a document: a
    // lesson still stored as a list of blocks is written as one first.
    if (host.type === "lesson" && !isContentDocument(document.content)) {
      const content = { ...lessonContentOf(document.content) };
      await saveDocument(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host,
        kind: "lesson",
        content,
        plainText: contentPlainText(content),
        mediaIds: contentFileIds(content),
        userId: context.actor.userId,
      });
    }
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
