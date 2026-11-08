import { reachOf } from "@faridalms/database/stores/audiences";
import { registrationsIn } from "@faridalms/database/stores/cmi5";
import {
  documentOf,
  publishedVersion,
} from "@faridalms/database/stores/documents";
import {
  lessonById,
  moduleReaches,
  progressIn,
  recordProgress,
} from "@faridalms/database/stores/learning";
import { completionMet, lessonContentOf } from "@faridalms/domain/learning";
import { lessonOfContent } from "@faridalms/domain/lesson-content";
import { schoolDate } from "@faridalms/domain/school";

import type { LearningScope } from "../xapi/live";

import { schoolZone } from "../core/procedure";
import { lessonFinished } from "../xapi/live";

/** The ids of the packages a student has satisfied in a lesson. */
export async function satisfiedPackages(
  scope: Pick<LearningScope, "tx" | "tenantId">,
  input: { lessonId: string; studentId: string },
): Promise<Set<string>> {
  const registrations = await registrationsIn(scope.tx, {
    tenantId: scope.tenantId,
    lessonId: input.lessonId,
    studentUserId: input.studentId,
  });
  return new Set(
    registrations
      .filter((row) => row.satisfiedAt !== null)
      .map((row) => row.packageId),
  );
}

/**
 * Finishes a lesson whose rule is its course packages, for a student its
 * module reaches, once every package of its published version is
 * satisfied, as their own work finishes any other lesson.
 */
export async function finishOnPackages(
  scope: LearningScope,
  input: { lessonId: string; studentId: string },
): Promise<boolean> {
  const lesson = await lessonById(scope.tx, scope.tenantId, input.lessonId);
  if (lesson?.completion !== "package") return false;
  const schoolId = scope.school.schoolId;
  const reach = await reachOf(scope.tx, {
    tenantId: scope.tenantId,
    schoolId,
    userId: input.studentId,
    on: schoolDate(await schoolZone(scope.tx, schoolId)),
  });
  if (
    !reach.student ||
    !(await moduleReaches(scope.tx, {
      tenantId: scope.tenantId,
      moduleId: lesson.moduleId,
      studentId: input.studentId,
      classIds: reach.classIds,
    }))
  )
    return false;
  const document = await documentOf(scope.tx, scope.tenantId, {
    type: "lesson",
    id: lesson.id,
  });
  const published = document
    ? await publishedVersion(scope.tx, scope.tenantId, document.id)
    : null;
  if (!published) return false;
  const met = completionMet(
    lesson,
    lessonOfContent(lessonContentOf(published.content)),
    {},
    {},
    await satisfiedPackages(scope, input),
  );
  if (!met) return false;
  const [before] = await progressIn(scope.tx, {
    tenantId: scope.tenantId,
    lessonIds: [lesson.id],
    studentIds: [input.studentId],
  });
  await recordProgress(scope.tx, {
    tenantId: scope.tenantId,
    lessonId: lesson.id,
    studentId: input.studentId,
    completed: { by: "student" },
  });
  await lessonFinished(scope, {
    lessonId: lesson.id,
    studentId: input.studentId,
    wasFinished: Boolean(before?.completedAt),
  });
  return true;
}
