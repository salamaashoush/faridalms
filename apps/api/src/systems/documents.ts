import type { Host } from "@faridalms/database/stores/documents";
import type { DocumentHold } from "@faridalms/database/stores/holds";
import type { ContentDocument } from "@faridalms/domain/content";

import {
  contentToRestore,
  documentIdOf,
  documentsInLanguages,
  makeCollaborative,
  versionsOf,
} from "@faridalms/database/stores/documents";
import {
  holdOf,
  releaseHold,
  takeHold,
} from "@faridalms/database/stores/holds";
import {
  signTicket,
  TICKET_TTL_SECONDS,
  roomOf,
} from "@faridalms/domain/collab";
import { HOLD_SECONDS } from "@faridalms/domain/document-holds";
import { pageContentSchema } from "@faridalms/domain/website";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { audit, readProcedure, writeProcedure } from "../core/procedure";
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
    // Records not written live are edited one person at a time instead.
    if (
      !rules ||
      !access ||
      (access === "read" && (await rules.keyed(context, host.id)))
    )
      throw new ORPCError("NOT_FOUND");
    // A room starts from the stored content, so it is put in shape first.
    if (access === "write") await rules.prepare?.(context, host.id);
    const document = await documentIdOf(context.tx, context.tenantId, host);
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

/**
 * A record whose document is held one person at a time, for someone who may
 * change it; live documents are shared instead and never held.
 */
async function holdable(context: UnitContext, host: Host) {
  if (liveRulesOf(host.type) || (await hostAccess(context, host)) !== "write")
    throw new ORPCError("NOT_FOUND");
}

const holdView = (context: UnitContext, hold: DocumentHold) => ({
  mine: hold.userId === context.actor.userId,
  holder: { id: hold.userId, nameEn: hold.nameEn, nameAr: hold.nameAr },
  since: hold.since,
});

/**
 * Holds a record's document for its editor while it is open, called again
 * to renew it: answers who holds it, the caller or someone else, and
 * since when. `take` takes it from whoever holds it; anyone who may edit
 * the record may, and the one it was taken from learns it on their next
 * renewal or save.
 */
export const hold = writeProcedure
  .input(v.object({ ...hostSchema.entries, take: v.optional(v.boolean()) }))
  .handler(async ({ input, context }) => {
    const host = { type: input.hostType, id: input.hostId };
    await holdable(context, host);
    const before = input.take
      ? await holdOf(context.tx, context.tenantId, host)
      : null;
    const after = await takeHold(context.tx, {
      tenantId: context.tenantId,
      host,
      userId: context.actor.userId,
      seconds: HOLD_SECONDS,
      force: input.take ?? false,
    });
    if (!after) throw new ORPCError("NOT_FOUND");
    if (before && before.userId !== context.actor.userId)
      await audit(context, {
        action: "document.take_over",
        objectType: host.type,
        objectId: host.id,
        subjectUserId: before.userId,
      });
    return holdView(context, after);
  });

/** Lets go of the caller's hold as their editor closes; someone else's stays. */
export const release = writeProcedure
  .input(hostSchema)
  .handler(async ({ input, context }) => {
    const host = { type: input.hostType, id: input.hostId };
    await holdable(context, host);
    await releaseHold(context.tx, {
      tenantId: context.tenantId,
      host,
      userId: context.actor.userId,
    });
    return { released: true };
  });

/**
 * The record's document in each language it is written in, original first,
 * for those who may change it; refused to anyone else.
 */
async function written(
  context: UnitContext,
  host: { type: string; id: string },
) {
  if ((await hostAccess(context, host)) !== "write")
    throw new ORPCError("NOT_FOUND");
  const documents = await documentsInLanguages(
    context.tx,
    context.tenantId,
    host,
  );
  return documents.filter(
    (row, index) =>
      documents.findIndex((other) => other.locale === row.locale) === index,
  );
}

/**
 * A document's earlier versions for those who write it, in each language
 * it is written in: each one readers were shown, the copies kept while
 * people edit together, and the text set aside before each restore.
 */
export const history = readProcedure
  .input(hostSchema)
  .handler(async ({ input, context }) => {
    const documents = await written(context, {
      type: input.hostType,
      id: input.hostId,
    });
    const versions = await Promise.all(
      documents.map(async (document) =>
        (await versionsOf(context.tx, context.tenantId, document.id)).map(
          (row) => ({ ...row, locale: document.locale }),
        ),
      ),
    );
    return {
      languages: documents.map((document) => document.locale),
      versions: versions
        .flat()
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
      /** The language whose version it is, where the record has two. */
      locale: v.optional(v.picklist(["en", "ar"])),
    }),
  )
  .handler(async ({ input, context }) => {
    const documents = await written(context, {
      type: input.hostType,
      id: input.hostId,
    });
    const document = input.locale
      ? documents.find((row) => row.locale === input.locale)
      : documents[0];
    if (!document) throw new ORPCError("NOT_FOUND");
    const content = await contentToRestore(context.tx, {
      tenantId: context.tenantId,
      documentId: document.id,
      documentVersion: input.documentVersion,
      userId: context.actor.userId,
    });
    if (!content) throw new ORPCError("NOT_FOUND");
    if (document.kind === "page") {
      const page = v.safeParse(pageContentSchema, content);
      if (!page.success) throw new ORPCError("NOT_FOUND");
      return {
        kind: "page" as const,
        locale: document.locale,
        page: page.output,
      };
    }
    return {
      kind: "document" as const,
      locale: document.locale,
      content: content as unknown as ContentDocument,
    };
  });
