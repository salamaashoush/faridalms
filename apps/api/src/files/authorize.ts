import type { StoredFile } from "@faridalms/database/stores/files";

import { hostsEmbedding } from "@faridalms/database/stores/documents";
import { filesByIds } from "@faridalms/database/stores/files";
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
 * A file belongs to its host, or, when it is media in a document, to every
 * record whose document shows it: whoever may read one of those may open it.
 */
export async function canReadFile(
  context: UnitContext,
  file: StoredFile,
): Promise<boolean> {
  if (file.uploadedByUserId === context.actor.userId) return true;
  if (file.hostType && file.hostId) {
    const reader = readers.get(file.hostType);
    return reader ? reader(context, file.hostId) : false;
  }
  if (file.purpose !== "document_media") return false;
  const hosts = await hostsEmbedding(context.tx, context.tenantId, file.id);
  const allowed = await Promise.all(
    hosts.map(async (host) => {
      const reader = readers.get(host.type);
      return reader ? reader(context, host.id) : false;
    }),
  );
  return allowed.includes(true);
}

/**
 * The media a document may keep: files the author may open themselves. One
 * they could not open (another class's picture, an id typed in by hand) is
 * refused rather than silently shared with the document's readers.
 */
export async function usableMedia(
  context: UnitContext,
  fileIds: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(fileIds)];
  const files = await filesByIds(context.tx, context.tenantId, unique);
  const readable = await Promise.all(
    files.map((file) => canReadFile(context, file)),
  );
  if (readable.includes(false))
    throw new ORPCError("FORBIDDEN", { message: "file.not_attachable" });
  return unique;
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
