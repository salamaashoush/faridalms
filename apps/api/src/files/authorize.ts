import type { StoredFile } from "@faridalms/database/stores/files";
import type { SharedKind } from "@faridalms/database/stores/shared";

import { broadcastTitles } from "@faridalms/database/stores/broadcasts";
import { purposeOfNotice } from "@faridalms/database/stores/comments";
import { eventTitles } from "@faridalms/database/stores/events";
import {
  adoptFiles,
  copyIntoHost,
  documentHostsOfFile,
  filesByIds,
  moveIntoArea,
} from "@faridalms/database/stores/files";
import { fileUses } from "@faridalms/database/stores/media";
import {
  sharedBlockTitles,
  sharedBlockUses,
} from "@faridalms/database/stores/shared";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/**
 * Whether the viewer may do something with one record of a kind: read the
 * files it holds, say. Some records open only some of their files.
 */
export type HostReader = (
  context: UnitContext,
  hostId: string,
  /** The file asked for, where one is: some records open only some of theirs. */
  file?: StoredFile,
) => Promise<boolean>;

/**
 * Where a kind of record keeps the files its document shows: an
 * assignment in its class's area, a lesson in its module's. Records with
 * no area keep their own.
 */
type AreaOf = (
  context: UnitContext,
  hostId: string,
) => Promise<{ type: string; id: string } | null>;

/**
 * How a kind of record's document may be opened live. A keyed document holds
 * answers its readers must not see, so only its writers may watch it; and a
 * record may rewrite stored content into the shape a room starts from.
 */
export interface LiveRules {
  keyed: (context: UnitContext, hostId: string) => Promise<boolean>;
  prepare?: (context: UnitContext, hostId: string) => Promise<void>;
}

/**
 * A kind of record that holds files and a document, by its host type: who
 * reads its files, who changes its document and how it opens live; and,
 * for an area, who keeps it and the records whose files it keeps. A file
 * whose host has no reader is readable only by the person who uploaded it,
 * so the files of a module that is off open to nobody else.
 */
export interface FileHost {
  hostType: string;
  read?: HostReader;
  write?: HostReader;
  live?: LiveRules;
  area?: {
    /** Who reads the whole area; others only what a document they read shows. */
    reader: HostReader;
    /** Who adds to, renames and deletes from the area. */
    writer: HostReader;
    /** The records whose documents keep their files in this area. */
    holders: Record<string, AreaOf>;
    /**
     * Documents anywhere show its files where they are rather than copying
     * them, so a change to one shows everywhere and the area can say where
     * each is used, as the school's media does.
     */
    linked?: boolean;
  };
  /** Whether a student may still keep work in the record, uncounted against their storage. */
  openWork?: HostReader;
  /** The records' titles, where lists of what shows something name them. */
  titlesOf?: (
    context: UnitContext,
    hostIds: readonly string[],
  ) => Promise<Map<string, HostTitle>>;
  /** Those of the records visitors read now, as on the website. */
  liveOf?: (
    context: UnitContext,
    hostIds: readonly string[],
  ) => Promise<ReadonlySet<string>>;
  /** The student a record is about, for the history of whoever opens its files. */
  studentOf?: (context: UnitContext, hostId: string) => Promise<string | null>;
  /** The record its document's editor is opened through, where not its own: a lesson's module. */
  parentOf?: (context: UnitContext, hostId: string) => Promise<string | null>;
}

/** A record as a list of where something is used names it, and where it sits. */
export interface HostTitle {
  titleEn: string | null;
  titleAr: string | null;
  placeEn?: string | null;
  placeAr?: string | null;
}

/** The hosts a module adds, answered only where it is on. */
export const fileHosts = point<readonly FileHost[]>("file hosts");

/** A reader that lets through whom a check does not refuse. */
export const passes =
  (
    check: (context: UnitContext, hostId: string) => Promise<unknown>,
  ): HostReader =>
  (context, hostId) =>
    check(context, hostId).then(
      () => true,
      () => false,
    );

const titled = (
  rows: Map<string, { titleEn: string | null; titleAr: string | null }>,
): Map<string, HostTitle> => rows;

const ownHosts: FileHost[] = [
  {
    hostType: "announcement",
    titlesOf: async (context, ids) =>
      titled(await broadcastTitles(context.tx, context.tenantId, ids)),
  },
  {
    hostType: "calendar_event",
    titlesOf: async (context, ids) =>
      titled(await eventTitles(context.tx, context.tenantId, ids)),
  },
  {
    hostType: "shared_block",
    titlesOf: async (context, ids) =>
      new Map(
        [...(await sharedBlockTitles(context.tx, context.tenantId, ids))].map(
          ([id, title]) => [id, { titleEn: title, titleAr: title }],
        ),
      ),
  },
  {
    hostType: "privacy_notice",
    parentOf: (context, id) =>
      purposeOfNotice(context.tx, context.tenantId, id),
  },
];

/** A kind of record of core's own. */
export function coreHost(host: FileHost) {
  ownHosts.push(host);
}

/** Who reads the files a kind of record of core's own holds. */
export const coreReader = (hostType: string, read: HostReader) =>
  coreHost({ hostType, read });

/** Who changes the document a kind of record of core's own holds. */
export const coreWriter = (hostType: string, write: HostReader) =>
  coreHost({ hostType, write });

/** A file area of core's own. */
export const coreArea = (
  hostType: string,
  area: NonNullable<FileHost["area"]>,
) => coreHost({ hostType, area });

const known = new WeakMap<UnitContext, Promise<Map<string, FileHost>>>();

/** Every kind of record the school answers for, core's and its modules' on, by host type. */
function hostsAt(context: UnitContext): Promise<Map<string, FileHost>> {
  let found = known.get(context);
  if (!found) {
    found = contributionsTo(context, fileHosts).then((added) => {
      const hosts = new Map<string, FileHost>();
      for (const host of [...ownHosts, ...added.flat()]) {
        const merged = { ...hosts.get(host.hostType), ...host };
        hosts.set(host.hostType, {
          ...merged,
          read: merged.read ?? merged.area?.reader,
        });
      }
      return hosts;
    });
    known.set(context, found);
  }
  return found;
}

export async function mayKeepArea(
  context: UnitContext,
  area: { type: string; id: string },
): Promise<boolean> {
  const writer = (await hostsAt(context)).get(area.type)?.area?.writer;
  return writer ? writer(context, area.id) : false;
}

async function areaFor(
  context: UnitContext,
  host: { type: string; id: string },
) {
  for (const each of (await hostsAt(context)).values()) {
    const areaOf = each.area?.holders[host.type];
    if (areaOf) return (await areaOf(context, host.id)) ?? host;
  }
  return host;
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
  // A recording still to be cut holds what its maker cut away, so until
  // the cut is made nobody else opens it, wherever it has been put.
  if (file.uncut && file.uploadedByUserId !== context.actor.userId)
    return false;
  if (file.hostType === "file_version" && file.hostId) {
    const [current] = await filesByIds(context.tx, context.tenantId, [
      file.hostId,
    ]);
    return Boolean(
      current?.hostType &&
      current.hostId &&
      (await mayKeepArea(context, {
        type: current.hostType,
        id: current.hostId,
      })),
    );
  }
  if (file.trashedAt) return false;
  if (file.uploadedByUserId === context.actor.userId) return true;
  if (!file.hostType || !file.hostId) return false;
  const hosts = await hostsAt(context);
  const own = hosts.get(file.hostType);
  if (own?.read && (await own.read(context, file.hostId, file))) return true;
  if (!own?.area) return false;
  for (const host of await documentHostsOfFile(
    context.tx,
    context.tenantId,
    file.id,
  )) {
    const through = hosts.get(host.type);
    if (
      !through?.area &&
      through?.read &&
      (await through.read(context, host.id))
    )
      return true;
  }
  return false;
}

/**
 * The records named, each with its title, where it sits and whether
 * visitors read it now. A record of a kind the school does not answer for,
 * as a module that is off, is left out; so is one its kind cannot name,
 * unless `untitled` keeps it under its kind alone.
 */
export async function titledHosts<
  T extends { hostType: string; hostId: string },
>(
  context: UnitContext,
  hosts: readonly T[],
  untitled: "keep" | "drop",
): Promise<(T & Required<HostTitle> & { live: boolean })[]> {
  const kinds = await hostsAt(context);
  const byType = new Map<string, string[]>();
  for (const host of hosts)
    if (kinds.has(host.hostType))
      byType.set(host.hostType, [
        ...(byType.get(host.hostType) ?? []),
        host.hostId,
      ]);
  const named = new Map<string, HostTitle & { live: boolean }>();
  await Promise.all(
    [...byType].map(async ([type, ids]) => {
      const kind = kinds.get(type);
      const [titles, live] = await Promise.all([
        kind?.titlesOf?.(context, ids) ?? new Map<string, HostTitle>(),
        kind?.liveOf?.(context, ids) ?? new Set<string>(),
      ]);
      for (const [id, title] of titles)
        named.set(`${type}:${id}`, { ...title, live: live.has(id) });
    }),
  );
  return hosts.flatMap((host) => {
    if (!kinds.has(host.hostType)) return [];
    const title = named.get(`${host.hostType}:${host.hostId}`);
    if (!title && untitled === "drop") return [];
    return [
      {
        ...host,
        titleEn: title?.titleEn ?? null,
        titleAr: title?.titleAr ?? null,
        placeEn: title?.placeEn ?? null,
        placeAr: title?.placeAr ?? null,
        live: title?.live ?? false,
      },
    ];
  });
}

/** The records whose documents show a shared block, by their titles, those the school cannot name left out. */
export async function blockUsesNamed(
  context: UnitContext,
  block: { id: string; kind: SharedKind },
) {
  const shown = await sharedBlockUses(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    id: block.id,
    kind: block.kind,
  });
  return (await titledHosts(context, shown, "drop")).toSorted((a, b) =>
    `${a.titleEn ?? ""}${a.placeEn ?? ""}`.localeCompare(
      `${b.titleEn ?? ""}${b.placeEn ?? ""}`,
    ),
  );
}

/** The records that show a file, each by its title in both languages where its kind names it. */
export async function fileUsesNamed(context: UnitContext, fileId: string) {
  const uses = await fileUses(context.tx, context.tenantId, fileId);
  return (await titledHosts(context, uses, "keep")).map((use) => ({
    hostType: use.hostType,
    hostId: use.hostId,
    titleEn: use.titleEn,
    titleAr: use.titleAr,
  }));
}

/** Each file's uses, by the title of each record that shows it. */
export async function usesNamed<
  R extends { usedIn: readonly { hostType: string; hostId: string }[] },
>(
  context: UnitContext,
  rows: readonly R[],
): Promise<
  (Omit<R, "usedIn"> & {
    usedIn: { hostType: string; hostId: string; title: string }[];
  })[]
> {
  const named = await titledHosts(
    context,
    rows.flatMap((row) => row.usedIn),
    "keep",
  );
  const titleOf = new Map(
    named.map((use) => [`${use.hostType}:${use.hostId}`, use.titleEn ?? ""]),
  );
  return rows.map((row) => ({
    ...row,
    usedIn: row.usedIn.flatMap((use) => {
      const title = titleOf.get(`${use.hostType}:${use.hostId}`);
      return title === undefined ? [] : [{ ...use, title }];
    }),
  }));
}

/**
 * The student a file is about, for the record of its opening to reach
 * their history: the one whose work or health record holds it. A health
 * record is read only inside its purpose, so call this within the file's
 * gate.
 */
export async function studentOfFile(
  context: UnitContext,
  file: { hostType: string | null; hostId: string | null },
): Promise<string | null> {
  if (!file.hostType || !file.hostId) return null;
  const studentOf = (await hostsAt(context)).get(file.hostType)?.studentOf;
  return studentOf ? studentOf(context, file.hostId) : null;
}

/** The record a document's editor is opened through, where it is not the document's own. */
export async function editorParentOf(
  context: UnitContext,
  host: { type: string; id: string },
): Promise<string | null> {
  const parentOf = (await hostsAt(context)).get(host.type)?.parentOf;
  return parentOf ? parentOf(context, host.id) : null;
}

/** Whether the viewer may hold a record's document to change it alone: one they write that is not written live. */
export async function holdsAlone(
  context: UnitContext,
  host: { type: string; id: string },
): Promise<boolean> {
  return (
    !(await liveRulesOf(context, host.type)) &&
    (await hostAccess(context, host)) === "write"
  );
}

/** Whether a student may still keep work in this record, uncounted against their storage. */
export async function mayWorkOn(context: UnitContext, workId: string) {
  for (const host of (await hostsAt(context)).values())
    if (host.openWork && (await host.openWork(context, workId))) return true;
  return false;
}

const held = (file: StoredFile, by: { type: string; id: string }) =>
  file.hostType === by.type && file.hostId === by.id;

/**
 * Puts the files a document shows in the keeping of the record it belongs
 * to, or of that record's area: the author's new uploads join it, files
 * already there are shown where they are, and a file from elsewhere that
 * the author may open is copied in, the stored content pointing at the
 * copy. One from a linked area, such as the school's media, is shown where
 * it is. One the author could not open is refused rather than shared.
 */
export async function placeMedia<T>(
  context: UnitContext,
  host: { type: string; id: string },
  content: T,
  fileIds: readonly string[],
): Promise<{ content: T; mediaIds: string[] }> {
  const unique = [...new Set(fileIds)];
  const hosts = await hostsAt(context);
  const keeper = await areaFor(context, host);
  const files = await filesByIds(context.tx, context.tenantId, unique);
  const own = (file: StoredFile) =>
    file.hostType === null && file.uploadedByUserId === context.actor.userId;
  const foreign = files.filter(
    (file) => !own(file) && !held(file, keeper) && !held(file, host),
  );
  // A linked area's file is shown where it is: its readers then include
  // this document's. One in the area's trash stays only where it was shown.
  const linkedHere = async (file: StoredFile) =>
    file.hostType !== null &&
    hosts.get(file.hostType)?.area?.linked === true &&
    ((await canReadFile(context, file)) ||
      (file.trashedAt !== null &&
        (await documentHostsOfFile(context.tx, context.tenantId, file.id)).some(
          (shown) => shown.type === host.type && shown.id === host.id,
        )));
  const copies = await Promise.all(
    foreign.map(async (file) => {
      if (await linkedHere(file)) return null;
      const copy = (await canReadFile(context, file))
        ? await copyIntoHost(context.tx, {
            tenantId: context.tenantId,
            userId: context.actor.userId,
            orgId: context.schoolId,
            host: keeper,
            sourceId: file.id,
          })
        : null;
      if (!copy)
        throw new ORPCError("FORBIDDEN", { message: "file.not_attachable" });
      return [file.id, copy] as const;
    }),
  );
  const adopted = new Set(
    await adoptFiles(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      host: keeper,
      ids: files.filter(own).map((file) => file.id),
    }),
  );
  // A message's attachment is for the conversation it is written in; put
  // anywhere else it would open to that record's readers.
  if (
    files.some(
      (file) =>
        own(file) &&
        file.purpose === "message_attachment" &&
        !adopted.has(file.id),
    )
  )
    throw new ORPCError("FORBIDDEN", { message: "file.not_attachable" });
  if (keeper !== host)
    await moveIntoArea(context.tx, {
      tenantId: context.tenantId,
      from: host,
      area: keeper,
      ids: files.filter((file) => held(file, host)).map((file) => file.id),
    });
  const replaced = new Map(copies.filter((copy) => copy !== null));
  if (replaced.size === 0) return { content, mediaIds: unique };
  let text = JSON.stringify(content);
  for (const [from, to] of replaced) text = text.replaceAll(from, to);
  return {
    content: JSON.parse(text) as T,
    mediaIds: unique.map((id) => replaced.get(id) ?? id),
  };
}

/** Whether the viewer may change the record's document, or only read it, or neither. */
export async function hostAccess(
  context: UnitContext,
  host: { type: string; id: string },
): Promise<"write" | "read" | null> {
  const found = (await hostsAt(context)).get(host.type);
  if (found?.write && (await found.write(context, host.id))) return "write";
  if (found?.read && (await found.read(context, host.id))) return "read";
  return null;
}

/** How a kind of record's document opens live, where it may. */
export async function liveRulesOf(
  context: UnitContext,
  hostType: string,
): Promise<LiveRules | undefined> {
  return (await hostsAt(context)).get(hostType)?.live;
}
