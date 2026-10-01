import type { ContentDocument } from "@faridalms/domain/content";

import { writeAudit } from "@faridalms/database/audit";
import { TenantUnavailableError } from "@faridalms/database/context";
import { teachesClass } from "@faridalms/database/stores/classes";
import {
  assignmentById,
  studentWork,
} from "@faridalms/database/stores/coursework";
import { documentOf } from "@faridalms/database/stores/documents";
import { filesByIds } from "@faridalms/database/stores/files";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { contentDisposition, safeFilename } from "@faridalms/domain/file";
import { ORPCError } from "@orpc/server";
import { Zip, ZipPassThrough } from "fflate";

import type {
  RequestContext,
  SchoolContext,
  UnitContext,
} from "../core/context";

import { can, openUnit, schoolOf } from "../core/procedure";

const PATH = /^\/v1\/assignments\/([0-9a-f-]{36})\/work\.zip$/;

interface Entry {
  path: string;
  text?: string;
  storageKey?: string;
}

function problem(status: number, code: string, requestId: string) {
  return Response.json({ code, requestId }, { status });
}

/** A folder or file name that cannot climb out of the archive or clash. */
function unique(name: string, taken: Set<string>): string {
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

/**
 * What the archive holds: one folder per student with work handed in, their
 * latest attempt's answer as text and each file it holds. Only a teacher of
 * the class, who may grade, gets it, and the export is recorded.
 */
async function entriesFor(
  unit: UnitContext,
  assignmentId: string,
): Promise<{ title: string; entries: Entry[] } | null> {
  if (!can(unit, "submissions:grade")) return null;
  const assignment = await assignmentById(unit.tx, unit.tenantId, assignmentId);
  if (
    !assignment ||
    assignment.orgId !== unit.schoolId ||
    !(await teachesClass(
      unit.tx,
      {
        tenantId: unit.tenantId,
        schoolId: unit.schoolId,
        today: unit.today,
        viewerId: unit.actor.userId,
        schoolWide: can(unit, "classes:manage"),
      },
      assignment.classId,
    ))
  )
    return null;
  const rows = await studentWork(unit.tx, {
    tenantId: unit.tenantId,
    assignmentId: assignment.id,
  });
  const entries: Entry[] = [];
  const folders = new Set<string>();
  for (const row of rows.filter((item) => item.attemptId)) {
    const folder = unique(
      [row.fullNameEn ?? row.fullNameAr ?? "student", row.isLate ? "late" : ""]
        .filter(Boolean)
        .join(" - "),
      folders,
    );
    const answer = await documentOf(unit.tx, unit.tenantId, {
      type: "submission_attempt",
      id: row.attemptId ?? "",
    });
    const content = answer?.content as unknown as ContentDocument | undefined;
    const names = new Set<string>();
    if (content && contentPlainText(content).trim())
      entries.push({
        path: `${folder}/${unique("answer.txt", names)}`,
        text: contentPlainText(content),
      });
    const files = content
      ? await filesByIds(unit.tx, unit.tenantId, contentFileIds(content))
      : [];
    for (const file of files.filter((item) => item.state === "ready"))
      entries.push({
        path: `${folder}/${unique(file.name, names)}`,
        storageKey: file.storageKey,
      });
  }
  await writeAudit(unit.tx, unit.tenantId, {
    action: "assignment.work_exported",
    objectType: "assignment",
    objectId: assignment.id,
    orgId: unit.schoolId,
    details: { students: folders.size, files: entries.length },
  });
  return { title: assignment.title, entries };
}

/**
 * "Download all": every student's latest handed-in work as one zip, built
 * as it streams so a large class never sits in memory.
 */
export async function handleWorkExport(
  request: Request,
  url: URL,
  context: RequestContext,
): Promise<Response | null> {
  const match = PATH.exec(url.pathname);
  if (!match?.[1] || request.method !== "GET") return null;
  const school = await schoolOf(context);
  if (!school) return problem(401, "UNAUTHORIZED", context.requestId);
  const scoped: SchoolContext = { ...context, school };
  const assignmentId = match[1];
  let found: Awaited<ReturnType<typeof entriesFor>>;
  try {
    found = await openUnit(scoped, "write", (unit) =>
      entriesFor({ ...scoped, ...unit }, assignmentId),
    );
  } catch (error) {
    if (error instanceof ORPCError)
      return problem(error.status, error.code, context.requestId);
    if (error instanceof TenantUnavailableError)
      return problem(503, "tenant.read_only", context.requestId);
    throw error;
  }
  if (!found) return problem(404, "NOT_FOUND", context.requestId);
  const { entries, title } = found;
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
      "content-disposition": contentDisposition(`${title}.zip`),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
