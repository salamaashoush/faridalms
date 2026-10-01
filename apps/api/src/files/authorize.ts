import type { StoredFile } from "@faridalms/database/stores/files";

import {
  adoptFiles,
  copyIntoHost,
  filesByIds,
} from "@faridalms/database/stores/files";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

/**
 * Who may read the files a kind of record holds, keyed by host type. Each
 * system registers its hosts; a file whose host has no reader is readable
 * only by the person who uploaded it.
 */
export type HostReader = (
  context: UnitContext,
  hostId: string,
) => Promise<boolean>;

const readers = new Map<string, HostReader>();

export function registerHostReader(hostType: string, reader: HostReader) {
  readers.set(hostType, reader);
}

/**
 * A file belongs to one record, its host: whoever may read that record may
 * open it. A file put in another record's document is copied into that
 * record (placeMedia), so a document never opens up files it only shows.
 */
export async function canReadFile(
  context: UnitContext,
  file: StoredFile,
): Promise<boolean> {
  if (file.uploadedByUserId === context.actor.userId) return true;
  if (!file.hostType || !file.hostId) return false;
  const reader = readers.get(file.hostType);
  return reader ? reader(context, file.hostId) : false;
}

/**
 * Puts the files a document shows in the keeping of the record it belongs
 * to: the author's new uploads join that record, and a file from elsewhere
 * that the author may open is copied into it, the stored content pointing at
 * the copy. One the author could not open is refused rather than shared.
 */
export async function placeMedia<T>(
  context: UnitContext,
  host: { type: string; id: string },
  content: T,
  fileIds: readonly string[],
): Promise<{ content: T; mediaIds: string[] }> {
  const unique = [...new Set(fileIds)];
  const files = await filesByIds(context.tx, context.tenantId, unique);
  const own = (file: StoredFile) =>
    file.hostType === null && file.uploadedByUserId === context.actor.userId;
  const foreign = files.filter(
    (file) =>
      !own(file) && !(file.hostType === host.type && file.hostId === host.id),
  );
  const copies = await Promise.all(
    foreign.map(async (file) => {
      const copy = (await canReadFile(context, file))
        ? await copyIntoHost(context.tx, {
            tenantId: context.tenantId,
            userId: context.actor.userId,
            host,
            sourceId: file.id,
          })
        : null;
      if (!copy)
        throw new ORPCError("FORBIDDEN", { message: "file.not_attachable" });
      return [file.id, copy] as const;
    }),
  );
  await adoptFiles(context.tx, {
    tenantId: context.tenantId,
    userId: context.actor.userId,
    host,
    ids: files.filter(own).map((file) => file.id),
  });
  const replaced = new Map(copies);
  let text = JSON.stringify(content);
  for (const [from, to] of replaced) text = text.replaceAll(from, to);
  return {
    content: replaced.size ? (JSON.parse(text) as T) : content,
    mediaIds: unique.map((id) => replaced.get(id) ?? id),
  };
}

/**
 * Who may change a kind of record's document, keyed by host type. Only hosts
 * with a writer can be edited live; the rest open read-only if at all.
 */
const writers = new Map<string, HostReader>();

export function registerHostWriter(hostType: string, writer: HostReader) {
  writers.set(hostType, writer);
}

export async function hostAccess(
  context: UnitContext,
  host: { type: string; id: string },
): Promise<"write" | "read" | null> {
  const writer = writers.get(host.type);
  if (writer && (await writer(context, host.id))) return "write";
  const reader = readers.get(host.type);
  if (reader && (await reader(context, host.id))) return "read";
  return null;
}
