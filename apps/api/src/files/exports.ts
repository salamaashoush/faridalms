import { TenantUnavailableError } from "@faridalms/database/context";
import { filesByIds } from "@faridalms/database/stores/files";
import { mediaItemsByIds } from "@faridalms/database/stores/media";
import { contentDisposition, safeFilename } from "@faridalms/domain/file";
import { MAX_MEDIA_BATCH, usesMedia } from "@faridalms/domain/media";
import { ORPCError } from "@orpc/server";
import { Zip, ZipPassThrough } from "fflate";

import type {
  RequestContext,
  SchoolContext,
  UnitContext,
} from "../core/context";

import { contributionsTo, point } from "../core/extension";
import { openUnit, schoolOf } from "../core/procedure";
import { refusalResponse } from "../core/refusal";

const ZIP = /^\/v1\/.+\.zip$/;
const MEDIA_ITEMS = /^\/v1\/media\/items\.zip$/;
const ID = /^[0-9a-f-]{36}$/;

/** One file of an archive: text written as it is, or a stored file's bytes. */
export interface Entry {
  path: string;
  text?: string;
  storageKey?: string;
}

/** An archive a module builds of what it keeps, at a path of its own under `/v1/`. */
export interface ZipExport {
  path: RegExp;
  /** The archive's name and entries for the path's first capture, or null for none the viewer may take. */
  build(
    unit: UnitContext,
    id: string,
  ): Promise<{ title: string; entries: Entry[] } | null>;
}

export const zipExports = point<ZipExport>("zip exports");

function problem(status: number, code: string, requestId: string) {
  return Response.json({ code, requestId }, { status });
}

/** A folder or file name that cannot climb out of the archive or clash. */
export function unique(name: string, taken: Set<string>): string {
  const safe = safeFilename(name).replaceAll("/", "-") || "file";
  let candidate = safe;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
    const dot = safe.lastIndexOf(".");
    candidate =
      dot > 0
        ? `${safe.slice(0, dot)} (${n})${safe.slice(dot)}`
        : `${safe} (${n})`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** Entries streamed as a zip as they are read, so a large one never sits in memory. */
function zipResponse(
  context: RequestContext,
  name: string,
  entries: Entry[],
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) {
          controller.error(error);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      for (const entry of entries) {
        const part = new ZipPassThrough(entry.path);
        zip.add(part);
        if (entry.text !== undefined) {
          part.push(new TextEncoder().encode(entry.text), true);
          continue;
        }
        const body = entry.storageKey
          ? await context.files.open(entry.storageKey)
          : null;
        if (!body) {
          part.push(new Uint8Array(), true);
          continue;
        }
        for await (const chunk of body) part.push(chunk);
        part.push(new Uint8Array(), true);
      }
      zip.end();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": contentDisposition(name),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Builds an export's entries in a unit of work, answering its refusals. */
async function exported(
  context: RequestContext,
  build: (
    unit: UnitContext,
  ) => Promise<{ title: string; entries: Entry[] } | null>,
): Promise<Response> {
  const school = await schoolOf(context);
  if (!school) return problem(401, "UNAUTHORIZED", context.requestId);
  const scoped: SchoolContext = { ...context, school };
  let found: Awaited<ReturnType<typeof build>>;
  try {
    found = await openUnit(scoped, "session", (unit) =>
      build({ ...scoped, ...unit }),
    );
  } catch (error) {
    if (error instanceof ORPCError)
      return refusalResponse(error, context.requestId);
    if (error instanceof TenantUnavailableError)
      return problem(503, "tenant.read_only", context.requestId);
    throw error;
  }
  if (!found) return problem(404, "NOT_FOUND", context.requestId);
  return zipResponse(context, `${found.title}.zip`, found.entries);
}

/**
 * Items of the school's media as one zip, for those who use it,
 * each under its name; items in the trash are left out.
 */
async function mediaItemsZip(
  unit: UnitContext,
  ids: readonly string[],
): Promise<{ title: string; entries: Entry[] } | null> {
  if (!usesMedia([...unit.actor.capabilities])) return null;
  const items = await mediaItemsByIds(
    unit.tx,
    unit.tenantId,
    unit.schoolId,
    ids,
  );
  const files = await filesByIds(
    unit.tx,
    unit.tenantId,
    items.filter((item) => !item.trashedAt).map((item) => item.id),
  );
  if (files.length === 0) return null;
  const names = new Set<string>();
  return {
    title: "media",
    entries: files
      .filter((file) => file.state === "ready" && file.keyVersion === null)
      .map((file) => ({
        path: unique(file.name, names),
        storageKey: file.storageKey,
      })),
  };
}

/** The exports this handler answers, by path. */
export async function handleWorkExport(
  request: Request,
  url: URL,
  context: RequestContext,
): Promise<Response | null> {
  if (request.method !== "GET" || !ZIP.test(url.pathname)) return null;
  if (MEDIA_ITEMS.test(url.pathname)) {
    const ids = [
      ...new Set((url.searchParams.get("ids") ?? "").split(",")),
    ].filter((id) => ID.test(id));
    if (ids.length === 0 || ids.length > MAX_MEDIA_BATCH)
      return problem(400, "BAD_REQUEST", context.requestId);
    return exported(context, (unit) => mediaItemsZip(unit, ids));
  }
  return exported(context, async (unit) => {
    for (const each of await contributionsTo(unit, zipExports)) {
      const id = each.path.exec(url.pathname)?.[1];
      if (id) return each.build(unit, id);
    }
    return null;
  });
}
