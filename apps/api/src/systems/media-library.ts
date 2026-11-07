import {
  adoptFiles,
  copyIntoHost,
  fileById,
  trashAreaFile,
} from "@faridalms/database/stores/files";
import {
  copySubjects,
  insertMediaFolder,
  deriveLibraryItem,
  describeLibraryItem,
  fileUses,
  libraryArea,
  libraryFolders,
  libraryItems,
  libraryItemsByIds,
  libraryKindCounts,
  moveLibraryItems,
  retireMediaFolder,
  renameMediaFolder,
  setLibraryWords,
} from "@faridalms/database/stores/media-library";
import { safeFilename } from "@faridalms/domain/file";
import {
  addToLibrarySchema,
  createFolderSchema,
  croppedName,
  cropItemSchema,
  describeItemSchema,
  folderRefSchema,
  itemRefSchema,
  keepInLibrarySchema,
  LIBRARY_AREA,
  LIBRARY_KEEPERS,
  LIBRARY_USERS,
  libraryQuerySchema,
  moveItemsSchema,
  renameFolderSchema,
  trashItemSchema,
} from "@faridalms/domain/media-library";
import { paged, pageWindow } from "@faridalms/domain/paging";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { audit, can, readProcedure, writeProcedure } from "../core/procedure";
import { canReadFile, registerArea } from "../files/authorize";

const usesLibrary = (context: UnitContext) =>
  LIBRARY_USERS.some((capability) => can(context, capability));
const keepsLibrary = (context: UnitContext) =>
  LIBRARY_KEEPERS.some((capability) => can(context, capability));

/**
 * The school's media library is a file area of the school: whoever writes
 * reads all of it, and a document anywhere shows its files where they are,
 * so its readers read those it shows and nothing else of the library.
 */
registerArea(LIBRARY_AREA, {
  reader: (context, schoolId) =>
    Promise.resolve(schoolId === context.schoolId && usesLibrary(context)),
  writer: (context, schoolId) =>
    Promise.resolve(schoolId === context.schoolId && keepsLibrary(context)),
  holders: {},
  linked: true,
});

function requireUser(context: UnitContext) {
  if (!usesLibrary(context)) throw new ORPCError("FORBIDDEN");
}

function requireKeeper(context: UnitContext) {
  if (!keepsLibrary(context)) throw new ORPCError("FORBIDDEN");
}

/** The folders from the top down to one, for the way back up. */
function pathTo<T extends { id: string; parentId: string | null }>(
  folders: readonly T[],
  id: string | null,
): T[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: T[] = [];
  let at = id ? byId.get(id) : undefined;
  while (at && path.length < folders.length) {
    path.unshift(at);
    at = at.parentId ? byId.get(at.parentId) : undefined;
  }
  return path;
}

/**
 * A page of the library: a folder's own folders and items, or what a
 * search or the trash finds in every folder, with every folder to move to.
 */
export const list = readProcedure
  .input(libraryQuerySchema)
  .handler(async ({ input, context }) => {
    requireUser(context);
    const folders = await libraryFolders(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const path = pathTo(folders, input.folderId);
    if (input.folderId && path.at(-1)?.id !== input.folderId)
      throw new ORPCError("NOT_FOUND");
    const view = { ...input, folderId: input.folderId ?? null };
    const [{ rows, total }, kinds] = await Promise.all([
      libraryItems(context.tx, context.tenantId, context.schoolId, {
        ...view,
        ...pageWindow(input.page),
      }),
      libraryKindCounts(context.tx, context.tenantId, context.schoolId, view),
    ]);
    const searching = input.trashed || input.q !== "";
    return {
      path,
      folders,
      children: searching
        ? []
        : folders.filter((folder) => folder.parentId === view.folderId),
      items: paged(rows, total, input.page),
      kinds,
      keeper: keepsLibrary(context),
    };
  });

/** Library items by id, as a document chooses them. */
export const items = readProcedure
  .input(
    v.object({
      ids: v.pipe(
        v.array(v.pipe(v.string(), v.uuid())),
        v.minLength(1),
        v.maxLength(50),
      ),
    }),
  )
  .handler(async ({ input, context }) => {
    requireUser(context);
    const found = await libraryItemsByIds(
      context.tx,
      context.tenantId,
      context.schoolId,
      input.ids,
    );
    return { items: found.filter((item) => !item.trashedAt) };
  });

/** The documents showing an item, so a change or a deletion is made knowing what it reaches. */
export const uses = readProcedure
  .input(itemRefSchema)
  .handler(async ({ input, context }) => {
    requireUser(context);
    const [item] = await libraryItemsByIds(
      context.tx,
      context.tenantId,
      context.schoolId,
      [input.id],
    );
    if (!item) throw new ORPCError("NOT_FOUND");
    return { uses: await fileUses(context.tx, context.tenantId, item.id) };
  });

export const createFolder = writeProcedure
  .input(createFolderSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    const created = await insertMediaFolder(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      parentId: input.parentId ?? null,
      name: input.name,
    });
    if (!created) throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "media.folder_create",
      objectType: "media_folder",
      objectId: created.id,
      details: {},
    });
    return created;
  });

export const renameFolder = writeProcedure
  .input(renameFolderSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    if (
      !(await renameMediaFolder(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: input.id,
        name: input.name,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    return { ok: true };
  });

/** Takes away an empty folder; one holding anything is kept. */
export const removeFolder = writeProcedure
  .input(folderRefSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    const outcome = await retireMediaFolder(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: input.id,
    });
    if (outcome === "missing") throw new ORPCError("NOT_FOUND");
    if (outcome === "not_empty")
      throw new ORPCError("CONFLICT", { message: "media.folder_not_empty" });
    await audit(context, {
      action: "media.folder_remove",
      objectType: "media_folder",
      objectId: input.id,
      details: {},
    });
    return { ok: true };
  });

/** Puts the viewer's own new uploads in the library, in a folder or at its top. */
export const add = writeProcedure
  .input(addToLibrarySchema)
  .handler(async ({ input, context }) => {
    requireUser(context);
    const area = libraryArea(context.schoolId);
    const added = await adoptFiles(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      host: area,
      ids: input.ids,
    });
    if (input.folderId) {
      const filed = await moveLibraryItems(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        ids: added,
        folderId: input.folderId,
      });
      if (filed.length < added.length) throw new ORPCError("NOT_FOUND");
    }
    return { ids: added };
  });

/**
 * Keeps a file shown somewhere in the library too, with the words it was
 * shown with and whom it shows. The library keeps its own copy of the
 * record, sharing the bytes, so the document keeps its own.
 */
export const keep = writeProcedure
  .input(keepInLibrarySchema)
  .handler(async ({ input, context }) => {
    requireUser(context);
    const area = libraryArea(context.schoolId);
    const file = await fileById(context.tx, context.tenantId, input.fileId);
    if (!file || file.state !== "ready" || !(await canReadFile(context, file)))
      throw new ORPCError("NOT_FOUND");
    if (file.hostType === area.type && file.hostId === area.id)
      return { id: file.id };
    const id = await copyIntoHost(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      orgId: context.schoolId,
      host: area,
      sourceId: file.id,
    });
    if (!id) throw new ORPCError("BAD_REQUEST", { message: "media.not_kept" });
    await setLibraryWords(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id,
      description: input.description,
      credit: input.credit,
    });
    if (input.folderId)
      await moveLibraryItems(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        ids: [id],
        folderId: input.folderId,
      });
    await copySubjects(context.tx, {
      tenantId: context.tenantId,
      from: file.id,
      to: id,
      taggedBy: context.actor.userId,
    });
    return { id };
  });

/**
 * Renames an item and sets what it says of itself: the description a
 * document starts from, which each use may say otherwise, and its credit.
 */
export const describe = writeProcedure
  .input(describeItemSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    if (
      !(await describeLibraryItem(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: input.id,
        name: safeFilename(input.name),
        description: input.description,
        credit: input.credit,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    return { ok: true };
  });

export const move = writeProcedure
  .input(moveItemsSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    const moved = await moveLibraryItems(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ids: input.ids,
      folderId: input.folderId,
    });
    if (moved.length === 0) throw new ORPCError("NOT_FOUND");
    return { ids: moved };
  });

/**
 * Deletes an item into the trash, or restores it. Documents showing a
 * deleted item show it as removed until it comes back; after 30 days the
 * sweep retires it.
 */
export const trash = writeProcedure
  .input(trashItemSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    const area = libraryArea(context.schoolId);
    if (
      !(await trashAreaFile(context.tx, {
        tenantId: context.tenantId,
        area,
        id: input.id,
        trashed: input.trashed,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: input.trashed ? "file.trashed" : "file.restored",
      objectType: "file",
      objectId: input.id,
      details: { hostType: area.type },
    });
    return { ok: true };
  });

/**
 * Keeps a cropped picture, cut in the browser and uploaded, as a new item
 * beside its original, which stays as it was for every document showing it.
 */
export const crop = writeProcedure
  .input(cropItemSchema)
  .handler(async ({ input, context }) => {
    requireUser(context);
    const area = libraryArea(context.schoolId);
    const [source] = await libraryItemsByIds(
      context.tx,
      context.tenantId,
      context.schoolId,
      [input.sourceId],
    );
    const upload = await fileById(context.tx, context.tenantId, input.fileId);
    if (
      !source ||
      source.trashedAt ||
      !source.mediaType.startsWith("image/") ||
      !upload?.mediaType.startsWith("image/")
    )
      throw new ORPCError("NOT_FOUND");
    const [adopted] = await adoptFiles(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      host: area,
      ids: [upload.id],
    });
    if (!adopted) throw new ORPCError("NOT_FOUND");
    await deriveLibraryItem(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      sourceId: source.id,
      fileId: adopted,
      name: croppedName(source.name, input.ratio),
      ratio: input.ratio,
    });
    await copySubjects(context.tx, {
      tenantId: context.tenantId,
      from: source.id,
      to: adopted,
      taggedBy: context.actor.userId,
    });
    return { id: adopted };
  });
