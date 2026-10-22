import type { LessonRow, ModuleRow } from "@faridalms/database/stores/learning";
import type { ContentDocument } from "@faridalms/domain/content";
import type { LessonCondition } from "@faridalms/domain/learning";

import {
  documentOf,
  saveDocument,
  saveTranslation,
  translationOf,
} from "@faridalms/database/stores/documents";
import {
  insertLesson,
  insertModule,
  lessonsOf,
  setModuleClasses,
} from "@faridalms/database/stores/learning";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { lessonContentOf } from "@faridalms/domain/learning";

import type { UnitContext } from "./context";

import { placeMedia } from "../files/authorize";

/** Where a module's unit plan is kept. */
export const planHost = (moduleId: string) => ({
  type: "module_plan",
  id: moduleId,
});

/**
 * A lesson copied to the end of a module: its settings and document, the
 * pictures and recordings in it copied into that module's keeping. It
 * starts unshown, whatever the lesson it came from.
 */
export async function copyLesson(
  context: UnitContext,
  lesson: LessonRow,
  moduleId: string,
  condition: LessonCondition | null = null,
) {
  const copy = await insertLesson(context.tx, {
    tenantId: context.tenantId,
    moduleId,
    title: lesson.title,
    completion: lesson.completion,
    passScore: lesson.passScore,
    review: lesson.review,
    vowelMarks: lesson.vowelMarks,
    language: lesson.language,
    translationTitle: lesson.translationTitle,
    young: lesson.young,
    bands: lesson.bands,
    readAlong: lesson.readAlong,
    condition,
  });
  const stored = await documentOf(context.tx, context.tenantId, {
    type: "lesson",
    id: lesson.id,
  });
  const content = { ...lessonContentOf(stored?.content) };
  const host = { type: "lesson", id: copy.id };
  const original = await saveDocument(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    host,
    kind: "lesson",
    ...(await placeMedia(context, host, content, contentFileIds(content))),
    plainText: contentPlainText(content),
    userId: context.actor.userId,
  });
  const translation = stored
    ? await translationOf(context.tx, context.tenantId, stored.id)
    : null;
  if (translation?.locale) {
    const words = { ...lessonContentOf(translation.content) };
    await saveTranslation(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      originalId: original.id,
      locale: translation.locale,
      kind: "lesson",
      ...(await placeMedia(context, host, words, contentFileIds(words))),
      plainText: contentPlainText(words),
      userId: context.actor.userId,
    });
  }
  return copy;
}

/**
 * A draft copy of a module for some classes of a school year: its lessons
 * with their rules, each depending on the copy of the lesson it did, and
 * the unit plan it was taught by, all theirs who copy it.
 */
export async function copyModule(
  context: UnitContext,
  source: ModuleRow,
  into: { yearId: string; classIds: readonly string[] },
) {
  const created = await insertModule(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    yearId: into.yearId,
    authorId: context.actor.userId,
    title: source.title,
    summary: source.summary,
    sequential: source.sequential,
    prerequisiteId: null,
    prerequisiteScore: null,
    practiceBands: source.practiceBands,
  });
  if (into.classIds.length > 0)
    await setModuleClasses(context.tx, {
      tenantId: context.tenantId,
      moduleId: created.id,
      classIds: into.classIds,
    });
  // A condition depends on an earlier lesson, copied by the time it is read.
  const copies = new Map<string, string>();
  for (const lesson of await lessonsOf(
    context.tx,
    context.tenantId,
    source.id,
  )) {
    const before = lesson.condition && copies.get(lesson.condition.lessonId);
    const copy = await copyLesson(
      context,
      lesson,
      created.id,
      lesson.condition && before
        ? { ...lesson.condition, lessonId: before }
        : null,
    );
    copies.set(lesson.id, copy.id);
  }
  const unitPlan = await documentOf(
    context.tx,
    context.tenantId,
    planHost(source.id),
  );
  if (unitPlan) {
    const content = { ...(unitPlan.content as unknown as ContentDocument) };
    const host = planHost(created.id);
    await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host,
      ...(await placeMedia(context, host, content, contentFileIds(content))),
      plainText: contentPlainText(content),
      userId: context.actor.userId,
    });
  }
  return created;
}
