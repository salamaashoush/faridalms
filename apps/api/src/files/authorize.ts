import type { StoredFile } from "@faridalms/database/stores/files";

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
