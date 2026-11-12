import {
  adoptFiles,
  copyIntoHost,
  fileById,
  initiateFile,
  schoolStorage,
  trashAreaFile,
} from "@faridalms/database/stores/files";
import {
  copyMediaTexts,
  copySubjects,
  creditMediaItem,
  deriveMediaItem,
  describeMediaItem,
  documentUploads,
  insertMediaFolder,
  mediaArea,
  mediaFacets,
  schoolMediaFolders,
  mediaItems,
  mediaItemsByIds,
  mediaKindCounts,
  mediaTwins,
  moveMediaItems,
  renameMediaFolder,
  renameMediaTag,
  retireMediaFolder,
  retireMediaTag,
  schoolStorageBreakdown,
  setMediaFocus,
  setMediaTexts,
  setMediaWords,
  tagMediaItems,
  trashMediaItems,
  untagMediaItems,
} from "@faridalms/database/stores/media";
import { safeFilename } from "@faridalms/domain/file";
import {
  addToMediaSchema,
  createFolderSchema,
  cropItemSchema,
  describeItemSchema,
  editedName,
  focusItemSchema,
  folderRefSchema,
  importLinkSchema,
  inDocumentsQuerySchema,
  isEdited,
  itemRefSchema,
  keepInMediaSchema,
  MEDIA_AREA,
  MEDIA_KEEPERS,
  MEDIA_USERS,
  mediaQuerySchema,
  moveItemsSchema,
  renameFolderSchema,
  renameTagSchema,
  replaceItemSchema,
  tagItemsSchema,
  tagRefSchema,
  trashItemSchema,
  trashItemsSchema,
} from "@faridalms/domain/media";
import { paged, pageWindow } from "@faridalms/domain/paging";
import { limitsOf } from "@faridalms/domain/plans";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { SchoolContext, UnitContext } from "../core/context";
import type { FetchedLink } from "../files/fetch-link";

import {
  audit,
  can,
  openUnit,
  readProcedure,
  schoolProcedure,
  schoolZone,
  writeProcedure,
} from "../core/procedure";
import { canReadFile, coreArea, fileUsesNamed } from "../files/authorize";
import { fetchLink, LinkError } from "../files/fetch-link";
import { replaceBytes, roomFor, versionsOf } from "../files/keeping";
import { hasVideo, uploadLimit } from "../files/limit";
import { takeUpload } from "../files/routes";

const usesMedia = (context: UnitContext) =>
  MEDIA_USERS.some((capability) => can(context, capability));
const keepsMedia = (context: UnitContext) =>
  MEDIA_KEEPERS.some((capability) => can(context, capability));

/**
 * The school's media is a file area of the school: whoever writes
 * reads all of it, and a document anywhere shows its files where they are,
 * so its readers read those it shows and nothing else of the school's media.
 */
coreArea(MEDIA_AREA, {
  reader: (context, schoolId) =>
    Promise.resolve(schoolId === context.schoolId && usesMedia(context)),
  writer: (context, schoolId) =>
    Promise.resolve(schoolId === context.schoolId && keepsMedia(context)),
  holders: {},
  linked: true,
});

function requireUser(context: UnitContext) {
  if (!usesMedia(context)) throw new ORPCError("FORBIDDEN");
}

function requireKeeper(context: UnitContext) {
  if (!keepsMedia(context)) throw new ORPCError("FORBIDDEN");
}

/** Records one change to each of several media items. */
async function auditItems(
  context: UnitContext,
  entry: {
    action: string;
    ids: readonly string[];
    details?: Record<string, unknown>;
  },
) {
  const { action, ids, details = {} } = entry;
  for (const id of ids)
    await audit(context, {
      action,
      objectType: "file",
      objectId: id,
      details: { hostType: MEDIA_AREA, ...details },
    });
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
 * A page of media: a folder's own folders and items, or what a
 * search or the trash finds in every folder, with every folder to move to.
 */
export const list = readProcedure
  .input(mediaQuerySchema)
  .handler(async ({ input, context }) => {
    requireUser(context);
    const folders = await schoolMediaFolders(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const path = pathTo(folders, input.folderId);
    if (input.folderId && path.at(-1)?.id !== input.folderId)
      throw new ORPCError("NOT_FOUND");
    const zone = await schoolZone(context.tx, context.schoolId);
    const view = { ...input, folderId: input.folderId ?? null, zone };
    const [{ rows, total }, kinds, facets] = await Promise.all([
      mediaItems(context.tx, context.tenantId, context.schoolId, {
        ...view,
        ...pageWindow(input.page),
      }),
      mediaKindCounts(context.tx, context.tenantId, context.schoolId, view),
      mediaFacets(context.tx, context.tenantId, context.schoolId, zone),
    ]);
    const searching =
      input.trashed ||
      input.q !== "" ||
      input.months.length > 0 ||
      input.uploaders.length > 0 ||
      input.tags.length > 0;
    return {
      path,
      folders,
      children: searching
        ? []
        : folders.filter((folder) => folder.parentId === view.folderId),
      items: paged(rows, total, input.page),
      kinds,
      facets,
      keeper: keepsMedia(context),
    };
  });

/** Media items by id, as a document chooses them. */
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
    const found = await mediaItemsByIds(
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
    const [item] = await mediaItemsByIds(
      context.tx,
      context.tenantId,
      context.schoolId,
      [input.id],
    );
    if (!item) throw new ORPCError("NOT_FOUND");
    return { uses: await fileUsesNamed(context, item.id) };
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
    await audit(context, {
      action: "media.folder_rename",
      objectType: "media_folder",
      objectId: input.id,
      details: {},
    });
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

/** Puts the viewer's own new uploads in media, in a folder or at its top. */
export const add = writeProcedure
  .input(addToMediaSchema)
  .handler(async ({ input, context }) => {
    requireUser(context);
    const area = mediaArea(context.schoolId);
    const added = await adoptFiles(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      host: area,
      ids: input.ids,
    });
    if (input.folderId) {
      const filed = await moveMediaItems(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        ids: added,
        folderId: input.folderId,
      });
      if (filed.length < added.length) throw new ORPCError("NOT_FOUND");
    }
    const [found] = added;
    if (input.found && found)
      await creditMediaItem(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: found,
        ...input.found,
      });
    await auditItems(context, {
      action: "media.item_add",
      ids: added,
      details: {
        folderId: input.folderId ?? null,
      },
    });
    return {
      ids: added,
      twins: await mediaTwins(
        context.tx,
        context.tenantId,
        context.schoolId,
        added,
      ),
    };
  });

/**
 * Keeps a file shown somewhere in media too, with the words it was
 * shown with and whom it shows. Media keeps its own copy of the
 * record, sharing the bytes, so the document keeps its own.
 */
export const keep = writeProcedure
  .input(keepInMediaSchema)
  .handler(async ({ input, context }) => {
    requireUser(context);
    const area = mediaArea(context.schoolId);
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
    await setMediaWords(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id,
      description: input.description,
      credit: input.credit,
    });
    if (input.folderId)
      await moveMediaItems(context.tx, {
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
    await auditItems(context, {
      action: "media.item_add",
      ids: [id],
      details: {
        keptFrom: file.id,
      },
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
    const [before] = await mediaItemsByIds(
      context.tx,
      context.tenantId,
      context.schoolId,
      [input.id],
    );
    const name = safeFilename(input.name);
    if (
      !before ||
      !(await describeMediaItem(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: input.id,
        name,
        description: input.description,
        credit: input.credit,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    await setMediaTexts(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: input.id,
      title: input.title,
      caption: input.caption,
    });
    const changed = {
      name: before.name !== name,
      title: before.title !== input.title,
      description: before.description !== input.description,
      caption: before.caption !== input.caption,
      credit:
        JSON.stringify(before.credit ?? null) !==
        JSON.stringify(input.credit ?? null),
    };
    if (changed.name)
      await auditItems(context, {
        action: "media.item_rename",
        ids: [input.id],
      });
    if (
      changed.title ||
      changed.description ||
      changed.caption ||
      changed.credit
    )
      await auditItems(context, {
        action: "media.item_describe",
        ids: [input.id],
        details: {
          fields: Object.entries(changed)
            .filter(([field, did]) => did && field !== "name")
            .map(([field]) => field),
        },
      });
    return { ok: true };
  });

export const move = writeProcedure
  .input(moveItemsSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    const moved = await moveMediaItems(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ids: input.ids,
      folderId: input.folderId,
    });
    if (moved.length === 0) throw new ORPCError("NOT_FOUND");
    await auditItems(context, {
      action: "media.item_move",
      ids: moved,
      details: {
        folderId: input.folderId,
      },
    });
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
    const area = mediaArea(context.schoolId);
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
 * Keeps a cropped picture, cut, turned, mirrored or resized in the browser
 * and uploaded, as a new item beside its original, which stays as it was
 * for every document showing it.
 */
export const crop = writeProcedure
  .input(cropItemSchema)
  .handler(async ({ input, context }) => {
    requireUser(context);
    const area = mediaArea(context.schoolId);
    const [source] = await mediaItemsByIds(
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
    await deriveMediaItem(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      sourceId: source.id,
      fileId: adopted,
      name: editedName(source.name, input.ratio, input.cut),
      ratio: input.ratio,
      edits: input.edits && isEdited(input.edits) ? input.edits : null,
    });
    await copySubjects(context.tx, {
      tenantId: context.tenantId,
      from: source.id,
      to: adopted,
      taggedBy: context.actor.userId,
    });
    await copyMediaTexts(context.tx, {
      tenantId: context.tenantId,
      from: source.id,
      to: adopted,
      taggedBy: context.actor.userId,
    });
    await auditItems(context, {
      action: "media.item_crop",
      ids: [adopted],
      details: {
        sourceId: source.id,
        ratio: input.ratio,
      },
    });
    return { id: adopted };
  });

/** Deletes several items into the trash at once, or restores them. */
export const trashMany = writeProcedure
  .input(trashItemsSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    const changed = await trashMediaItems(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ids: input.ids,
      trashed: input.trashed,
    });
    if (changed.length === 0) throw new ORPCError("NOT_FOUND");
    await auditItems(context, {
      action: input.trashed ? "file.trashed" : "file.restored",
      ids: changed,
    });
    return { ids: changed };
  });

/**
 * Files items under tags by name, making any the school lacks, and takes
 * them out from under others.
 */
export const tag = writeProcedure
  .input(tagItemsSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    const found = await mediaItemsByIds(
      context.tx,
      context.tenantId,
      context.schoolId,
      input.ids,
    );
    if (found.length === 0) throw new ORPCError("NOT_FOUND");
    const ids = found.map((item) => item.id);
    const added = await tagMediaItems(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ids,
      names: input.add,
      taggedBy: context.actor.userId,
    });
    await untagMediaItems(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ids,
      tagIds: input.remove,
    });
    await auditItems(context, {
      action: "media.item_tag",
      ids,
      details: {
        added: added.map((each) => each.name),
        removed: input.remove.length,
      },
    });
    return { tags: added };
  });

export const renameTag = writeProcedure
  .input(renameTagSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    if (
      !(await renameMediaTag(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: input.id,
        name: input.name,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "media.tag_rename",
      objectType: "media_tag",
      objectId: input.id,
      details: {},
    });
    return { ok: true };
  });

/** Takes a tag away, and off every item filed under it; the items stay. */
export const removeTag = writeProcedure
  .input(tagRefSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    if (
      !(await retireMediaTag(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: input.id,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "media.tag_remove",
      objectType: "media_tag",
      objectId: input.id,
      details: {},
    });
    return { ok: true };
  });

/** An item of media, outside its trash, for a change to its file. */
async function mediaFile(context: UnitContext, id: string) {
  const file = await fileById(context.tx, context.tenantId, id);
  const area = mediaArea(context.schoolId);
  if (
    !file ||
    file.state !== "ready" ||
    file.trashedAt ||
    file.hostType !== area.type ||
    file.hostId !== area.id
  )
    throw new ORPCError("NOT_FOUND");
  return file;
}

/** An item's previous files, while the trash keeps them. */
export const versions = readProcedure
  .input(itemRefSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    await mediaFile(context, input.id);
    return { versions: await versionsOf(context, input.id) };
  });

/**
 * Puts a new upload under an item, or brings back one of its previous
 * files: every document and page showing the item shows the new one, and
 * the one it had stays a previous version for 30 days.
 */
export const replace = writeProcedure
  .input(replaceItemSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    const target = await mediaFile(context, input.id);
    await replaceBytes(context, target, input.sourceId, {
      hostType: MEDIA_AREA,
    });
    return { ok: true };
  });

/** The most uploads in documents media looks through at once. */
const DOCUMENT_UPLOADS = 200;

/**
 * What staff put straight into the documents they wrote, which media
 * does not hold yet, for keeping there in one step; only those the viewer
 * may open are listed, and never a student's work or a conversation's.
 */
export const inDocuments = readProcedure
  .input(inDocumentsQuerySchema)
  .handler(async ({ input, context }) => {
    requireUser(context);
    const found = await documentUploads(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      q: input.q,
      limit: DOCUMENT_UPLOADS,
    });
    const files = await Promise.all(
      found.map((row) => fileById(context.tx, context.tenantId, row.id)),
    );
    const readable = await Promise.all(
      files.map(async (file) =>
        file ? await canReadFile(context, file) : false,
      ),
    );
    const rows = found.filter((_row, index) => readable[index]);
    const window = pageWindow(input.page);
    return {
      items: paged(
        rows.slice(window.offset, window.offset + window.limit),
        rows.length,
        input.page,
      ),
    };
  });

/** Where the school's storage goes, by kind of file and by person, for those who keep media. */
export const storage = readProcedure.handler(async ({ context }) => {
  requireKeeper(context);
  const [used, breakdown] = await Promise.all([
    schoolStorage(context.tx, context.tenantId, context.schoolId),
    schoolStorageBreakdown(context.tx, context.tenantId, context.schoolId),
  ]);
  return {
    ...used,
    limitBytes: limitsOf(context.school.entitlements).poolBytes,
    ...breakdown,
  };
});

/**
 * How long a link may take to answer, all of it, redirects included; a
 * school with video may bring in a video at its video limit, which takes
 * longer to arrive.
 */
const LINK_SECONDS = 20;
const VIDEO_LINK_SECONDS = 180;

/**
 * Brings a file on the web into media: the server fetches it, never
 * from a private, loopback, link-local or metadata address and never past
 * its time or the limit an upload of its type has here, so a video comes
 * in up to the school's video limit where the school has video; and it is
 * checked by its bytes and scanned as any upload is. No transaction is
 * held while it arrives.
 */
export const importLink = schoolProcedure
  .input(importLinkSchema)
  .handler(async ({ input, context }) => {
    const school: SchoolContext = context;
    await openUnit(school, "read", async (unit) => {
      const scoped = { ...school, ...unit };
      requireUser(scoped);
      if (input.folderId) {
        const folders = await schoolMediaFolders(
          unit.tx,
          unit.tenantId,
          unit.schoolId,
        );
        if (!folders.some((folder) => folder.id === input.folderId))
          throw new ORPCError("NOT_FOUND");
      }
    });
    let fetched;
    try {
      fetched = await fetchLink(input.url, {
        maxBytes: (mediaType) =>
          uploadLimit(school, { purpose: "document_media", mediaType }),
        timeoutMs:
          (hasVideo(school.school.entitlements)
            ? VIDEO_LINK_SECONDS
            : LINK_SECONDS) * 1000,
      });
    } catch (error) {
      if (error instanceof LinkError)
        throw new ORPCError("BAD_REQUEST", { message: error.code });
      throw error;
    }
    try {
      return await keepLinked(school, input, fetched);
    } finally {
      await fetched.discard();
    }
  });

/** A file fetched from a link, taken as an upload and put in media. */
async function keepLinked(
  school: SchoolContext,
  input: { url: string; folderId: string | null },
  fetched: FetchedLink,
) {
  const file = await openUnit(school, "write", async (unit) => {
    const scoped = { ...school, ...unit };
    await roomFor(scoped, {
      purpose: "document_media",
      name: fetched.name,
      mediaType: fetched.mediaType,
      sizeBytes: fetched.sizeBytes,
      destination: undefined,
      trim: undefined,
    });
    return initiateFile(unit.tx, {
      tenantId: unit.tenantId,
      userId: unit.actor.userId,
      orgId: unit.schoolId,
      purpose: "document_media",
      name: fetched.name,
      mediaType: fetched.mediaType,
      sizeBytes: fetched.sizeBytes,
    });
  });
  const taken = await takeUpload(school, file, fetched.body());
  if (!taken.ok)
    throw new ORPCError(
      taken.status === 503 ? "SERVICE_UNAVAILABLE" : "BAD_REQUEST",
      {
        message: taken.code,
      },
    );
  return openUnit(school, "write", async (unit) => {
    const scoped = { ...school, ...unit };
    const [added] = await adoptFiles(unit.tx, {
      tenantId: unit.tenantId,
      userId: unit.actor.userId,
      host: mediaArea(unit.schoolId),
      ids: [file.id],
    });
    if (!added) throw new ORPCError("CONFLICT");
    if (input.folderId)
      await moveMediaItems(unit.tx, {
        tenantId: unit.tenantId,
        orgId: unit.schoolId,
        ids: [added],
        folderId: input.folderId,
      });
    await auditItems(scoped, {
      action: "media.item_add",
      ids: [added],
      details: {
        link: new URL(input.url).hostname,
      },
    });
    return {
      id: added,
      name: file.name,
      twins: await mediaTwins(unit.tx, unit.tenantId, unit.schoolId, [added]),
    };
  });
}

/**
 * Sets where a picture's subject sits, or forgets it: crops start from it,
 * and the website keeps it in view wherever a use does not say otherwise.
 */
export const focus = writeProcedure
  .input(focusItemSchema)
  .handler(async ({ input, context }) => {
    requireKeeper(context);
    if (
      !(await setMediaFocus(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        id: input.id,
        focus: input.focus,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    return { ok: true };
  });
