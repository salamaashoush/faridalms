import type { Capability } from "@faridalms/domain/capabilities";
import type { FilePurpose } from "@faridalms/domain/file";

import {
  adoptFiles,
  areaFiles,
  initiateFile,
  renameAreaFile,
  trashAreaFile,
} from "@faridalms/database/stores/files";
import {
  fileAreaSchema,
  initiateUploadSchema,
  safeFilename,
} from "@faridalms/domain/file";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { mayKeepArea } from "../files/authorize";

const UPLOADERS: Record<FilePurpose, Capability[]> = {
  attachment: ["assignments:author", "messages:send"],
  submission: ["own-work:submit"],
  // Students write their answers as documents with files in them.
  document_media: [
    "own-work:submit",
    "assignments:author",
    "learning:author",
    "site:manage",
    "calendar:author",
    "calendar:manage",
    "announcements:manage",
    "newsletters:manage",
  ],
  site_media: ["site:manage"],
};

/**
 * Step one of an upload: record who is uploading what, for which purpose, and
 * hand back where to send the bytes. The file only becomes usable once the
 * server has verified what arrived.
 */
export const initiate = writeProcedure
  .input(initiateUploadSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, ...UPLOADERS[input.purpose]);
    if (input.sizeBytes > context.maxUploadBytes)
      throw new ORPCError("BAD_REQUEST", { message: "file.too_large" });
    const file = await initiateFile(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      purpose: input.purpose,
      name: safeFilename(input.name),
      mediaType: input.mediaType.toLowerCase().split(";")[0]?.trim() ?? "",
      sizeBytes: input.sizeBytes,
    });
    return {
      id: file.id,
      name: file.name,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
    };
  });

async function keptArea(
  context: UnitContext,
  area: v.InferOutput<typeof fileAreaSchema>,
) {
  if (!(await mayKeepArea(context, area))) throw new ORPCError("NOT_FOUND");
}

const areaFileSchema = v.object({
  area: fileAreaSchema,
  id: v.pipe(v.string(), v.uuid()),
});

/** A class's or module's files, with the lessons and assignments showing each. */
export const area = readProcedure
  .input(v.object({ area: fileAreaSchema, trashed: v.boolean() }))
  .handler(async ({ input, context }) => {
    await keptArea(context, input.area);
    return {
      files: await areaFiles(
        context.tx,
        context.tenantId,
        input.area,
        input.trashed,
      ),
    };
  });

/** Puts the viewer's own new uploads in an area, for its documents to use. */
export const addToArea = writeProcedure
  .input(
    v.object({
      area: fileAreaSchema,
      ids: v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.maxLength(50)),
    }),
  )
  .handler(async ({ input, context }) => {
    await keptArea(context, input.area);
    const added = await adoptFiles(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      host: input.area,
      ids: input.ids,
    });
    return { ids: added };
  });

export const renameInArea = writeProcedure
  .input(
    v.object({
      ...areaFileSchema.entries,
      name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
    }),
  )
  .handler(async ({ input, context }) => {
    await keptArea(context, input.area);
    if (
      !(await renameAreaFile(context.tx, {
        tenantId: context.tenantId,
        area: input.area,
        id: input.id,
        name: safeFilename(input.name),
      }))
    )
      throw new ORPCError("NOT_FOUND");
    return { ok: true };
  });

/**
 * Deletes a file from an area into its trash, or restores it. Documents
 * showing a deleted file show it as removed until it comes back.
 */
export const trashInArea = writeProcedure
  .input(v.object({ ...areaFileSchema.entries, trashed: v.boolean() }))
  .handler(async ({ input, context }) => {
    await keptArea(context, input.area);
    if (
      !(await trashAreaFile(context.tx, {
        tenantId: context.tenantId,
        area: input.area,
        id: input.id,
        trashed: input.trashed,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: input.trashed ? "file.trashed" : "file.restored",
      objectType: "file",
      objectId: input.id,
      details: { hostType: input.area.type, hostId: input.area.id },
    });
    return { ok: true };
  });
