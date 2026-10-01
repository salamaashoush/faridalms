import type { StoredFile } from "@faridalms/database/stores/files";

import {
  adoptFiles,
  copyIntoHost,
  documentHostsOfFile,
  filesByIds,
  moveIntoArea,
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
 * Where a kind of record keeps the files its document shows: an
 * assignment in its class's area, a lesson in its module's. Records with
 * no area keep their own.
 */
type AreaOf = (
  context: UnitContext,
  hostId: string,
) => Promise<{ type: string; id: string } | null>;

const areas = new Map<string, AreaOf>();
const areaTypes = new Set<string>();
const areaWriters = new Map<string, HostReader>();

export function registerArea(
  areaType: string,
  rules: {
    /** Who reads the whole area; others only what a document they read shows. */
    reader: HostReader;
    /** Who adds to, renames and deletes from the area. */
    writer: HostReader;
    /** The records whose documents keep their files in this area. */
    holders: Record<string, AreaOf>;
  },
) {
  readers.set(areaType, rules.reader);
  areaWriters.set(areaType, rules.writer);
  areaTypes.add(areaType);
  for (const [hostType, areaOf] of Object.entries(rules.holders))
    areas.set(hostType, areaOf);
}

export async function mayKeepArea(
  context: UnitContext,
  area: { type: string; id: string },
): Promise<boolean> {
  const writer = areaWriters.get(area.type);
  return writer ? writer(context, area.id) : false;
}

async function areaFor(
  context: UnitContext,
  host: { type: string; id: string },
) {
  const areaOf = areas.get(host.type);
  return (areaOf ? await areaOf(context, host.id) : null) ?? host;
}

/**
 * A file belongs to one record, its host: whoever may read that record may
 * open it. A file put in another record's document is copied into that
 * record's keeping (placeMedia), so a document never opens up files it only
 * shows. A file in a class's or module's area is also open to whoever may
 * read a document of that area showing it, as a family reads a brief.
 */
export async function canReadFile(
  context: UnitContext,
  file: StoredFile,
): Promise<boolean> {
  if (file.trashedAt) return false;
  if (file.uploadedByUserId === context.actor.userId) return true;
  if (!file.hostType || !file.hostId) return false;
  const reader = readers.get(file.hostType);
  if (reader && (await reader(context, file.hostId))) return true;
  if (!areaTypes.has(file.hostType)) return false;
  for (const host of await documentHostsOfFile(
    context.tx,
    context.tenantId,
    file.id,
  )) {
    const through = readers.get(host.type);
    if (
      !areaTypes.has(host.type) &&
      through &&
      (await through(context, host.id))
    )
      return true;
  }
  return false;
}

const held = (file: StoredFile, by: { type: string; id: string }) =>
  file.hostType === by.type && file.hostId === by.id;

/**
 * Puts the files a document shows in the keeping of the record it belongs
 * to, or of that record's area: the author's new uploads join it, files
 * already there are shown where they are, and a file from elsewhere that
 * the author may open is copied in, the stored content pointing at the
 * copy. One the author could not open is refused rather than shared.
 */
export async function placeMedia<T>(
  context: UnitContext,
  host: { type: string; id: string },
  content: T,
  fileIds: readonly string[],
): Promise<{ content: T; mediaIds: string[] }> {
  const unique = [...new Set(fileIds)];
  const keeper = await areaFor(context, host);
  const files = await filesByIds(context.tx, context.tenantId, unique);
  const own = (file: StoredFile) =>
    file.hostType === null && file.uploadedByUserId === context.actor.userId;
  const foreign = files.filter(
    (file) => !own(file) && !held(file, keeper) && !held(file, host),
  );
  const copies = await Promise.all(
    foreign.map(async (file) => {
      const copy = (await canReadFile(context, file))
        ? await copyIntoHost(context.tx, {
            tenantId: context.tenantId,
            userId: context.actor.userId,
            host: keeper,
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
    host: keeper,
    ids: files.filter(own).map((file) => file.id),
  });
  if (keeper !== host)
    await moveIntoArea(context.tx, {
      tenantId: context.tenantId,
      from: host,
      area: keeper,
      ids: files.filter((file) => held(file, host)).map((file) => file.id),
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

/**
 * How a kind of record's document may be opened live. A keyed document holds
 * answers its readers must not see, so only its writers may watch it; and a
 * record may rewrite stored content into the shape a room starts from.
 */
export interface LiveRules {
  keyed: (context: UnitContext, hostId: string) => Promise<boolean>;
  prepare?: (context: UnitContext, hostId: string) => Promise<void>;
}

const liveRules = new Map<string, LiveRules>();

export function registerLiveRules(hostType: string, rules: LiveRules) {
  liveRules.set(hostType, rules);
}

export function liveRulesOf(hostType: string): LiveRules | undefined {
  return liveRules.get(hostType);
}
