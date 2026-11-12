import type { Capability } from "@faridalms/domain/capabilities";
import type { ContentDocument } from "@faridalms/domain/content";
import type { SavedSection } from "@faridalms/domain/saved-sections";

import { changeOf } from "@faridalms/database/audit";
import {
  documentOf,
  saveDocument,
  snapshotPublish,
} from "@faridalms/database/stores/documents";
import {
  insertSharedBlock,
  removeSharedBlock,
  sharedBlockById,
  sharedBlocksOf,
  updateSharedBlock,
} from "@faridalms/database/stores/shared";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { PAGE_SIZE } from "@faridalms/domain/paging";
import {
  savedSectionFileIds,
  savedSectionPlainText,
} from "@faridalms/domain/saved-sections";
import {
  saveSharedSchema,
  saveSharedSectionSchema,
  sharedQuerySchema,
  sharedRefSchema,
} from "@faridalms/domain/shared";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { reviseLivePages } from "../core/shared";
import {
  coreReader,
  coreWriter,
  placeMedia,
  blockUsesNamed,
} from "../files/authorize";

const hostOf = (id: string) => ({ type: "shared_block", id });

const AUTHORS: readonly Capability[] = [
  "learning:author",
  "assignments:author",
  "announcements:manage",
  "site:manage",
];

/** Whoever writes the school's documents, teaching or announcements, may keep blocks and use the school's. */
function requireAuthor(context: UnitContext) {
  if (!AUTHORS.some((capability) => can(context, capability)))
    throw new ORPCError("FORBIDDEN");
}

/** A shared block or section of the viewer's school, or nothing. */
async function ofSchool(context: UnitContext, id: string) {
  const row = await sharedBlockById(context.tx, context.tenantId, id);
  return row?.orgId === context.schoolId ? row : null;
}

/** Whoever manages the website keeps sections for its pages and uses the school's. */
const requireSectionAuthor = (context: UnitContext) =>
  requireCapability(context, "site:manage");

/** A shared block the viewer may put in a document: their own, or the school's. */
async function usable(context: UnitContext, id: string) {
  const row = await ofSchool(context, id);
  return row &&
    (row.scope === "school" || row.ownerUserId === context.actor.userId)
    ? row
    : null;
}

// A shared block is the school's teaching, shown in its lessons and briefs
// to whoever reads them, so anyone at the school may open its pictures.
coreReader("shared_block", async (context, id) =>
  Boolean(await ofSchool(context, id)),
);
// Its teacher alone changes it, and so alone reads and restores its history.
coreWriter(
  "shared_block",
  async (context, id) =>
    (await ofSchool(context, id))?.ownerUserId === context.actor.userId,
);

/** The shared blocks the viewer may use, newest first. */
export const list = readProcedure
  .input(sharedQuerySchema)
  .handler(async ({ input, context }) => {
    if (input.kind === "section") requireSectionAuthor(context);
    else requireAuthor(context);
    const { rows, next } = await sharedBlocksOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      userId: context.actor.userId,
      ...input,
      limit: PAGE_SIZE,
    });
    const shown = rows.map((row) => ({
      id: row.id,
      version: row.version,
      title: row.title,
      scope: row.scope,
      ownerNameEn: row.ownerNameEn,
      ownerNameAr: row.ownerNameAr,
      mine: row.ownerUserId === context.actor.userId,
      updatedAt: row.updatedAt,
    }));
    return { rows: shown, next };
  });

/**
 * A shared block as a document shows it: anyone at the school reads it
 * wherever it stands, and its owner may change it.
 */
export const read = readProcedure
  .input(sharedRefSchema)
  .handler(async ({ input, context }) => {
    const row = await ofSchool(context, input.id);
    if (row?.kind !== "block") throw new ORPCError("NOT_FOUND");
    const document = await documentOf(
      context.tx,
      context.tenantId,
      hostOf(row.id),
    );
    if (!document) throw new ORPCError("NOT_FOUND");
    return {
      id: row.id,
      version: row.version,
      title: row.title,
      scope: row.scope,
      editable: row.ownerUserId === context.actor.userId,
      content: document.content as unknown as ContentDocument,
    };
  });

/** A shared section in both its languages, as a page draws it, for whoever manages the website. */
export const section = readProcedure
  .input(sharedRefSchema)
  .handler(async ({ input, context }) => {
    requireSectionAuthor(context);
    const row = await ofSchool(context, input.id);
    if (row?.kind !== "section") throw new ORPCError("NOT_FOUND");
    const document = await documentOf(
      context.tx,
      context.tenantId,
      hostOf(row.id),
    );
    if (!document) throw new ORPCError("NOT_FOUND");
    return {
      id: row.id,
      version: row.version,
      title: row.title,
      scope: row.scope,
      editable: row.ownerUserId === context.actor.userId,
      section: document.content as unknown as SavedSection,
    };
  });

/**
 * Keeps blocks to show in many documents, or changes a shared block, which
 * every document showing it then shows. Its pictures and files are copied
 * in, so it stays whole whatever becomes of the document it came from.
 */
export const save = writeProcedure
  .input(saveSharedSchema)
  .handler(async ({ input, context }) => {
    requireAuthor(context);
    const fields = {
      tenantId: context.tenantId,
      scope: input.scope,
      title: input.title,
    };
    let saved: { id: string; version: number };
    const before = input.id ? await usable(context, input.id) : null;
    if (input.id) {
      const row = before;
      if (row?.kind !== "block") throw new ORPCError("NOT_FOUND");
      if (row.ownerUserId !== context.actor.userId)
        throw new ORPCError("FORBIDDEN", { message: "shared.not_owner" });
      const version = await updateSharedBlock(context.tx, {
        ...fields,
        id: row.id,
        expectedVersion: input.expectedVersion,
      });
      if (version === null)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      saved = { id: row.id, version };
    } else
      saved = await insertSharedBlock(context.tx, {
        ...fields,
        orgId: context.schoolId,
        ownerUserId: context.actor.userId,
      });
    const host = hostOf(saved.id);
    const document = await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      ...(await placeMedia(
        context,
        host,
        input.content,
        contentFileIds(input.content),
      )),
      plainText: contentPlainText(input.content),
      userId: context.actor.userId,
    });
    // Every save reaches its readers at once, so each is kept as shown.
    await snapshotPublish(context.tx, {
      tenantId: context.tenantId,
      documentId: document.id,
      userId: context.actor.userId,
    });
    await audit(context, {
      action: input.id ? "shared_block.update" : "shared_block.create",
      objectType: "shared_block",
      objectId: saved.id,
      details: { scope: input.scope },
      change: changeOf("core.shared_blocks", before, {
        scope: input.scope,
        title: input.title,
      }),
    });
    return saved;
  });

/**
 * Keeps a website section, in both languages, to show on many pages, or
 * changes one, which every page showing it then shows: in the builder at
 * once, and to visitors of every published page showing it, drawn again
 * from what that page last published. Its pictures and files are copied
 * in, so it stays whole whatever becomes of the page it came from. A change
 * that would put something on a published page publishing refuses is
 * refused here too.
 */
export const saveSection = writeProcedure
  .input(saveSharedSectionSchema)
  .handler(async ({ input, context }) => {
    requireSectionAuthor(context);
    const fields = {
      tenantId: context.tenantId,
      scope: input.scope,
      title: input.title,
    };
    let saved: { id: string; version: number };
    const before = input.id ? await usable(context, input.id) : null;
    if (input.id) {
      if (before?.kind !== "section") throw new ORPCError("NOT_FOUND");
      if (before.ownerUserId !== context.actor.userId)
        throw new ORPCError("FORBIDDEN", { message: "shared.not_owner" });
      const version = await updateSharedBlock(context.tx, {
        ...fields,
        id: before.id,
        expectedVersion: input.expectedVersion,
      });
      if (version === null)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      saved = { id: before.id, version };
    } else
      saved = await insertSharedBlock(context.tx, {
        ...fields,
        kind: "section",
        orgId: context.schoolId,
        ownerUserId: context.actor.userId,
      });
    const host = hostOf(saved.id);
    const document = await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      kind: "section",
      locale: input.section.locale,
      ...(await placeMedia(
        context,
        host,
        input.section,
        savedSectionFileIds(input.section),
      )),
      plainText: savedSectionPlainText(input.section),
      userId: context.actor.userId,
    });
    await snapshotPublish(context.tx, {
      tenantId: context.tenantId,
      documentId: document.id,
      userId: context.actor.userId,
    });
    const pages = input.id ? await reviseLivePages(context, saved.id) : 0;
    await audit(context, {
      action: input.id ? "shared_section.update" : "shared_section.create",
      objectType: "shared_block",
      objectId: saved.id,
      details: { scope: input.scope, livePages: pages },
      change: changeOf("core.shared_blocks", before, {
        scope: input.scope,
        title: input.title,
      }),
    });
    return saved;
  });

/**
 * The documents showing a shared block, or the pages showing a shared
 * section, for its writer to see what a change or taking it out reaches
 * before they make it.
 */
export const uses = readProcedure
  .input(sharedRefSchema)
  .handler(async ({ input, context }) => {
    const row = await usable(context, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    if (row.kind === "section") requireSectionAuthor(context);
    else requireAuthor(context);
    return blockUsesNamed(context, row);
  });

/** Takes a shared block out; documents that showed it say it is gone. Only its owner may. */
export const remove = writeProcedure
  .input(sharedRefSchema)
  .handler(async ({ input, context }) => {
    const row = await usable(context, input.id);
    if (!row) throw new ORPCError("NOT_FOUND");
    if (row.ownerUserId !== context.actor.userId)
      throw new ORPCError("FORBIDDEN", { message: "shared.not_owner" });
    await removeSharedBlock(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
    });
    // Published pages leave a section taken out at once, as its changes
    // reach them; drafts show it gone until they publish again.
    if (row.kind === "section")
      await audit(context, {
        action: "shared_section.remove",
        objectType: "shared_block",
        objectId: row.id,
        details: { livePages: await reviseLivePages(context, row.id) },
      });
    else
      await audit(context, {
        action: "shared_block.remove",
        objectType: "shared_block",
        objectId: row.id,
      });
    return { removed: true };
  });
