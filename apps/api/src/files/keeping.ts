import type { StorageUse, StoredFile } from "@faridalms/database/stores/files";
import type { InitiateUploadInput, StorageScope } from "@faridalms/domain/file";

import {
  areaStorage,
  fileById,
  fileVersions,
  personStorage,
  replaceFileBytes,
  schoolStorage,
} from "@faridalms/database/stores/files";
import { fileFamily } from "@faridalms/domain/file";
import { limitsOf, WARN_SHARE } from "@faridalms/domain/plans";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { audit } from "../core/procedure";
import { mayKeepArea, mayWorkOn } from "./authorize";

/** The code an upload is refused with when the storage it counts against is full. */
const FULL: Record<StorageScope, string> = {
  school: "file.quota_school",
  class: "file.quota_class",
  module: "file.quota_module",
  person: "file.quota_person",
};

/**
 * Checks the storage an upload counts against, refusing one that would not
 * fit, and names the fullest past the warning share. A student's work on an
 * assignment still open to them is never refused, only counted.
 */
export async function roomFor(
  context: UnitContext,
  input: InitiateUploadInput,
): Promise<{
  scope: StorageScope;
  usedBytes: number;
  limitBytes: number;
} | null> {
  const destination = input.destination;
  if (
    destination?.type === "work" &&
    (await mayWorkOn(context, destination.id))
  )
    return null;
  const limits = limitsOf(context.school.entitlements);
  const scopes: { scope: StorageScope; used: StorageUse; limit: number }[] = [
    {
      scope: "school",
      used: await schoolStorage(context.tx, context.tenantId, context.schoolId),
      limit: limits.poolBytes,
    },
  ];
  if (destination?.type === "class" || destination?.type === "module") {
    const area = { type: destination.type, id: destination.id };
    if (!(await mayKeepArea(context, area))) throw new ORPCError("NOT_FOUND");
    scopes.push({
      scope: destination.type,
      used: await areaStorage(context.tx, context.tenantId, area),
      limit:
        destination.type === "class" ? limits.classBytes : limits.moduleBytes,
    });
  } else if (destination?.type === "work" || input.purpose !== "document_media")
    scopes.push({
      scope: "person",
      used: await personStorage(
        context.tx,
        context.tenantId,
        context.actor.userId,
      ),
      limit: limits.personBytes,
    });
  for (const { scope, used, limit } of scopes)
    if (used.usedBytes + input.sizeBytes > limit)
      throw new ORPCError("FORBIDDEN", { message: FULL[scope] });
  const fullest = scopes
    .map(({ scope, used, limit }) => ({
      scope,
      usedBytes: used.usedBytes + input.sizeBytes,
      limitBytes: limit,
    }))
    .toSorted((a, b) => b.usedBytes / b.limitBytes - a.usedBytes / a.limitBytes)
    .at(0);
  return fullest && fullest.usedBytes >= fullest.limitBytes * WARN_SHARE
    ? fullest
    : null;
}

/**
 * Puts the viewer's new upload, or one of the file's previous versions,
 * under a file, so every document showing it shows the new bytes. Only the
 * same kind of file may stand in, so a picture block never receives a
 * spreadsheet. What it held stays as a previous version for 30 days.
 */
export async function replaceBytes(
  context: UnitContext,
  target: StoredFile,
  sourceId: string,
  details: Record<string, unknown>,
) {
  const source = await fileById(context.tx, context.tenantId, sourceId);
  const usable =
    source?.state === "ready" &&
    ((source.hostType === null &&
      source.uploadedByUserId === context.actor.userId &&
      source.purpose === target.purpose) ||
      (source.hostType === "file_version" && source.hostId === target.id));
  if (!source || !usable) throw new ORPCError("NOT_FOUND");
  if (
    fileFamily(source.name, source.mediaType) !==
    fileFamily(target.name, target.mediaType)
  )
    throw new ORPCError("BAD_REQUEST", { message: "file.replace_kind" });
  const replaced = await context.cell.withWorker(
    {
      tenantId: context.tenantId,
      requestId: context.requestId,
      actor: { kind: "system" },
    },
    "write",
    (tx) =>
      replaceFileBytes(tx, {
        tenantId: context.tenantId,
        targetId: target.id,
        sourceId: source.id,
        userId: context.actor.userId,
      }),
  );
  if (!replaced) throw new ORPCError("CONFLICT");
  await audit(context, {
    action: "file.replaced",
    objectType: "file",
    objectId: target.id,
    details: { ...details, restored: source.hostType === "file_version" },
  });
}

/** A file's previous versions, while the trash keeps them, as a list shows them. */
export async function versionsOf(context: UnitContext, fileId: string) {
  const rows = await fileVersions(context.tx, context.tenantId, fileId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    replacedAt: row.trashedAt ?? "",
  }));
}
