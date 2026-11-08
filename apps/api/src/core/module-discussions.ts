import type { AssignmentRow } from "@faridalms/database/stores/coursework";
import type { ContentDocument } from "@faridalms/domain/content";

import { classById } from "@faridalms/database/stores/classes";
import {
  discussionGroupsOf,
  discussionParts,
  insertAssignment,
  setAssignmentState,
  setDiscussionGroup,
  setRecipients,
  updateAssignment,
} from "@faridalms/database/stores/coursework";
import {
  documentOf,
  dropTranslation,
  saveDocument,
  saveTranslation,
  snapshotPublish,
  translationOf,
} from "@faridalms/database/stores/documents";
import {
  audiencesOf,
  classesOfModule,
} from "@faridalms/database/stores/learning";
import { dayIn, schoolYears } from "@faridalms/database/stores/years";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { isLater } from "@faridalms/domain/publication";
import { otherLocale } from "@faridalms/domain/translations";

import type { UnitContext } from "./context";

import { placeMedia } from "../files/authorize";
import { teachingScope, tellAssigned } from "./teaching-notices";

/**
 * A module's discussion is one discussion across every class the module is
 * set for. Each class takes part in its own part of it, an assignment of
 * that class: its students' posts, read and moderated by the teachers of
 * that class, and its grade line. The parts share the discussion's words,
 * settings and dates; who takes part in each class is who the module
 * reaches there.
 */

/** Who in a class a module reaches, as an assignment's audience. */
export async function audienceIn(
  context: UnitContext,
  moduleId: string,
  classId: string,
) {
  const chosen = (
    await audiencesOf(context.tx, { tenantId: context.tenantId, moduleId })
  ).find((row) => row.classId === classId);
  return chosen && chosen.groupIds.length + chosen.studentIds.length > 0
    ? {
        audience: "selected" as const,
        selection: { groupIds: chosen.groupIds, studentIds: chosen.studentIds },
      }
    : {
        audience: "class" as const,
        selection: { groupIds: [], studentIds: [] },
      };
}

/** A part's recipients: those the module reaches in its class today. */
async function reachPart(
  context: UnitContext,
  part: { id: string; classId: string; schoolYearId: string },
  moduleId: string,
) {
  const { audience, selection } = await audienceIn(
    context,
    moduleId,
    part.classId,
  );
  const year = (
    await schoolYears(context.tx, context.tenantId, context.schoolId)
  ).find((row) => row.id === part.schoolYearId);
  return setRecipients(context.tx, {
    tenantId: context.tenantId,
    assignmentId: part.id,
    classId: part.classId,
    audience,
    selection,
    on: year ? dayIn(year, context.today) : context.today,
  });
}

/** The discussion's own fields as another class's part takes them. */
function sharedFields(lead: AssignmentRow) {
  return {
    title: lead.title,
    availableFrom: lead.availableFrom,
    dueAt: lead.dueAt,
    closesAt: lead.closesAt,
    latePolicy: lead.latePolicy,
    lateDeductionPercent: lead.lateDeductionPercent,
    submissionFormat: lead.submissionFormat,
    maxFiles: lead.maxFiles,
    resubmission: lead.resubmission,
    points: lead.points,
    rubric: lead.rubric,
    quizAttempts: lead.quizAttempts,
    quizKeep: lead.quizKeep,
    quizReveal: lead.quizReveal,
    quizShuffle: lead.quizShuffle,
    quizTimeLimit: lead.quizTimeLimit,
    quizPractice: lead.quizPractice,
    quizBands: lead.quizBands,
    gradeAfterAnswers: lead.gradeAfterAnswers,
    discussionPostFirst: lead.discussionPostFirst,
    discussionReplies: lead.discussionReplies,
    moduleId: lead.moduleId,
    peerReviews: lead.peerReviews,
    peerAnonymous: lead.peerAnonymous,
    peerDueAt: lead.peerDueAt,
    language: lead.language,
    translationTitle: lead.translationTitle,
  };
}

/** Writes the lead's brief and its translation as another part's own. */
async function copyWords(
  context: UnitContext,
  lead: AssignmentRow,
  partId: string,
): Promise<string> {
  const { tx, tenantId, schoolId } = context;
  const brief = await documentOf(tx, tenantId, {
    type: "assignment",
    id: lead.id,
  });
  const content = {
    ...((brief?.content as ContentDocument | undefined) ?? emptyContent()),
  };
  const host = { type: "assignment", id: partId };
  const saved = await saveDocument(tx, {
    tenantId,
    orgId: schoolId,
    host,
    ...(await placeMedia(context, host, content, contentFileIds(content))),
    plainText: contentPlainText(content),
    userId: context.actor.userId,
  });
  const translated = brief ? await translationOf(tx, tenantId, brief.id) : null;
  if (translated && lead.language) {
    const words = { ...(translated.content as unknown as ContentDocument) };
    await saveTranslation(tx, {
      tenantId,
      orgId: schoolId,
      host,
      originalId: saved.id,
      locale: otherLocale(lead.language),
      kind: "rich_text",
      ...(await placeMedia(context, host, words, contentFileIds(words))),
      plainText: contentPlainText(words),
      userId: context.actor.userId,
    });
  } else await dropTranslation(tx, { tenantId, originalId: saved.id });
  return saved.id;
}

/** Puts a part out as the lead is: its readers reached and its words published. */
async function publishPart(
  context: UnitContext,
  part: AssignmentRow,
  documentId: string,
  moduleId: string,
) {
  await reachPart(context, part, moduleId);
  await snapshotPublish(context.tx, {
    tenantId: context.tenantId,
    documentId,
    userId: context.actor.userId,
  });
  if (part.state !== "draft") return;
  const saved = await setAssignmentState(context.tx, {
    tenantId: context.tenantId,
    id: part.id,
    expectedVersion: part.version,
    state: "published",
  });
  if (saved && !isLater(part.availableFrom, context.now))
    await tellAssigned(teachingScope(context), part);
}

/**
 * Brings every other part of a module discussion to what its lead now
 * says, makes a part for each class of the module that has none yet, and
 * puts each out where the lead is out. A part keeps its own class, grade
 * category and term; parts in classes the module has left keep their
 * posts and stay as they were.
 */
export async function spreadDiscussion(
  context: UnitContext,
  lead: AssignmentRow,
): Promise<void> {
  const group = lead.discussionGroup;
  const moduleId = lead.moduleId;
  if (!group || !moduleId) return;
  const { tx, tenantId } = context;
  const parts = await discussionParts(tx, { tenantId, group });
  const classes = await classesOfModule(tx, tenantId, moduleId);
  const published = lead.state === "published";
  for (const part of parts) {
    if (part.id === lead.id || part.state === "archived") continue;
    if (!classes.some((row) => row.id === part.classId)) continue;
    const classRow = await classById(tx, context, part.classId);
    if (!classRow) continue;
    const saved = await updateAssignment(tx, {
      tenantId,
      id: part.id,
      expectedVersion: part.version,
      classRow,
      ...sharedFields(lead),
      audience: part.audience,
      gradingPeriodId: part.gradingPeriodId,
      categoryId: part.categoryId,
    });
    if (!saved) continue;
    const documentId = await copyWords(context, lead, part.id);
    if (published)
      await publishPart(
        context,
        { ...part, ...sharedFields(lead), version: saved.version },
        documentId,
        moduleId,
      );
  }
  for (const row of classes) {
    if (parts.some((part) => part.classId === row.id)) continue;
    const classRow = await classById(tx, context, row.id);
    if (classRow?.schoolYearId !== lead.schoolYearId) continue;
    const { audience } = await audienceIn(context, moduleId, row.id);
    const created = await insertAssignment(tx, {
      tenantId,
      orgId: context.schoolId,
      classRow,
      authorUserId: lead.authorUserId,
      ...sharedFields(lead),
      audience,
      gradingPeriodId: null,
      categoryId: null,
    });
    await setDiscussionGroup(tx, { tenantId, id: created.id, group });
    const documentId = await copyWords(context, lead, created.id);
    if (published)
      await publishPart(
        context,
        {
          ...lead,
          id: created.id,
          version: created.version,
          classId: classRow.id,
          state: "draft",
          discussionGroup: group,
        },
        documentId,
        moduleId,
      );
  }
}

/**
 * Spreads each of a module's discussions to the classes it is set for now,
 * as when a class joins the module, each from its first part still in use.
 */
export async function spreadModuleDiscussions(
  context: UnitContext,
  moduleId: string,
): Promise<void> {
  const groups = await discussionGroupsOf(context.tx, {
    tenantId: context.tenantId,
    moduleId,
  });
  for (const group of groups) {
    const parts = await discussionParts(context.tx, {
      tenantId: context.tenantId,
      group,
    });
    const lead =
      parts.find((part) => part.id === group && part.state !== "archived") ??
      parts.find((part) => part.state !== "archived");
    if (lead) await spreadDiscussion(context, lead);
  }
}
