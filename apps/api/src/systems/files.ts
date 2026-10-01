import type { Capability } from "@faridalms/domain/capabilities";
import type { FilePurpose } from "@faridalms/domain/file";

import { initiateFile } from "@faridalms/database/stores/files";
import { initiateUploadSchema, safeFilename } from "@faridalms/domain/file";
import { ORPCError } from "@orpc/server";

import { requireCapability, writeProcedure } from "../core/procedure";

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
