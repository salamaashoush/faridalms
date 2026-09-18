import { initiateFile } from "@faridalms/database/repositories/files";
import { initiateUploadSchema, safeFilename } from "@faridalms/domain/file";
import { ORPCError } from "@orpc/server";

import { requirePermission } from "../authorization";
import { protectedProcedure } from "../procedure";

/**
 * Step one of an upload: record who is uploading what, for which purpose, and
 * hand back a server-generated destination. Bytes follow on the raw route and
 * the record only becomes usable once the server has verified them.
 */
export const initiateUpload = protectedProcedure
  .input(initiateUploadSchema)
  .handler(async ({ input, context }) => {
    const user = await requirePermission(
      context,
      input.purpose === "assignment_resource"
        ? "assignments:author"
        : "own-work:submit",
    );
    if (input.sizeBytes > context.maxUploadBytes)
      throw new ORPCError("BAD_REQUEST", { message: "file.too_large" });
    const id = crypto.randomUUID();
    const row = await initiateFile(context.db, {
      id,
      ownerId: user.id,
      purpose: input.purpose,
      name: safeFilename(input.name),
      mediaType: input.mediaType.toLowerCase().split(";")[0]?.trim() ?? "",
      sizeBytes: input.sizeBytes,
      storageKey: `${context.school.id}/${id}`,
    });
    return {
      id: row.id,
      name: row.name,
      mediaType: row.mediaType,
      sizeBytes: row.sizeBytes,
      uploadPath: `/v1/files/${row.id}/content`,
    };
  });
