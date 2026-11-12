import type { ContentDocument } from "@faridalms/domain/content";

import { writeAudit } from "@faridalms/database/audit";
import {
  assignmentById,
  handedInWork,
  studentWork,
} from "@faridalms/database/stores/coursework";
import { documentOf } from "@faridalms/database/stores/documents";
import { filesByIds } from "@faridalms/database/stores/files";
import { namesOf } from "@faridalms/database/stores/persons";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";

import type { UnitContext } from "../core/context";
import type { Entry, ZipExport } from "../files/exports";

import { can } from "../core/procedure";
import { reachesStudent, teaches } from "../core/reach";
import { unique } from "../files/exports";

/** An attempt's answer as text and each file it holds, in one folder. */
async function attemptEntries(
  unit: UnitContext,
  attemptId: string,
  folder: string,
): Promise<Entry[]> {
  const answer = await documentOf(unit.tx, unit.tenantId, {
    type: "submission_attempt",
    id: attemptId,
  });
  const content = answer?.content as unknown as ContentDocument | undefined;
  const names = new Set<string>();
  const entries: Entry[] = [];
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
  return entries;
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
    !(await teaches(unit, "teaching", assignment.classId))
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
    entries.push(...(await attemptEntries(unit, row.attemptId ?? "", folder)));
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
 * A student's portfolio: every piece of work they have handed in, a folder
 * each with its latest attempt's answer and files. The student may take it,
 * and so may staff who reach their record; each export is recorded.
 */
async function portfolioFor(
  unit: UnitContext,
  studentId: string,
): Promise<{ title: string; entries: Entry[] } | null> {
  const own = unit.actor.userId === studentId;
  const staff =
    can(unit, "people:read") &&
    (await reachesStudent(unit, "teaching", studentId));
  if (!own && !staff) return null;
  const work = await handedInWork(unit.tx, {
    tenantId: unit.tenantId,
    orgId: unit.schoolId,
    studentId,
  });
  const [person] = await namesOf(unit.tx, unit.tenantId, [studentId]);
  const entries: Entry[] = [];
  const folders = new Set<string>();
  for (const row of work) {
    const folder = unique(
      `${row.submittedAt.slice(0, 10)} ${row.classCode} ${row.title}`,
      folders,
    );
    entries.push(...(await attemptEntries(unit, row.attemptId, folder)));
  }
  await writeAudit(unit.tx, unit.tenantId, {
    action: "student.portfolio_exported",
    objectType: "user",
    objectId: studentId,
    subjectUserId: studentId,
    orgId: unit.schoolId,
    details: { pieces: folders.size, files: entries.length },
  });
  const name = person?.fullNameEn ?? person?.fullNameAr ?? "portfolio";
  return { title: name, entries };
}

/** Work handed in, for a teacher to mark offline, and a student's portfolio of it. */
export const COURSEWORK_EXPORTS: readonly ZipExport[] = [
  {
    path: /^\/v1\/assignments\/([0-9a-f-]{36})\/work\.zip$/,
    build: entriesFor,
  },
  {
    path: /^\/v1\/students\/([0-9a-f-]{36})\/portfolio\.zip$/,
    build: portfolioFor,
  },
];
