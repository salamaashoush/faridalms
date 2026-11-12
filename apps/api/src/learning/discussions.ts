import type { AssignmentRow } from "@faridalms/database/stores/coursework";
import type { ContentDocument } from "@faridalms/domain/content";

import { classById } from "@faridalms/database/stores/classes";
import {
  assignmentById,
  insertAssignment,
  isRecipient,
  setAssignmentState,
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
  moduleById,
} from "@faridalms/database/stores/learning";
import {
  discussionGroupsOf,
  discussionParts,
  moduleDiscussions,
  placeDiscussion,
  placementsOf,
} from "@faridalms/database/stores/module-discussions";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { isLater } from "@faridalms/domain/publication";
import { dayWithin } from "@faridalms/domain/school";
import { otherLocale } from "@faridalms/domain/translations";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";
import type { ModuleContributions } from "../core/extension";
import type { ModuleDiscussion } from "./points";

import { changeRefusal } from "../classes/points";
import { contribute } from "../core/extension";
import { can, requireCapability } from "../core/procedure";
import { requireStudent, teaches } from "../core/reach";
import { ownSchedule, taughtAssignment } from "../coursework/access";
import { teachingScope, tellAssigned } from "../coursework/notices";
import { assignmentParts, partsFollow } from "../coursework/points";
import { placeMedia } from "../files/authorize";
import { mayEditModule } from "./access";
import { moduleParts } from "./points";

/**
 * A module's discussion is one discussion across every class the module is
 * set for. Each class takes part in its own part of it, an assignment of
 * that class: its students' posts, read and moderated by the teachers of
 * that class, and its grade line. The parts share the discussion's words,
 * settings and dates; who takes part in each class is who the module
 * reaches there.
 */

/** Who in a class a module reaches, as an assignment's audience. */
async function audienceIn(
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
  part: { id: string; classId: string },
  moduleId: string,
) {
  const { audience, selection } = await audienceIn(
    context,
    moduleId,
    part.classId,
  );
  const found = await classById(context.tx, context, part.classId);
  return setRecipients(context.tx, {
    tenantId: context.tenantId,
    assignmentId: part.id,
    classId: part.classId,
    audience,
    selection,
    on: found ? dayWithin(found.runs, context.today) : context.today,
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
 * posts and stay as they were, and so do parts in classes that take no
 * more changes, such as those of a closed year.
 */
async function spreadDiscussion(
  context: UnitContext,
  lead: AssignmentRow,
  placement: { moduleId: string; group: string },
): Promise<void> {
  const { group, moduleId } = placement;
  const { tx, tenantId } = context;
  const parts = await discussionParts(tx, { tenantId, group });
  const classes = await classesOfModule(tx, tenantId, moduleId);
  const published = lead.state === "published";
  for (const part of parts) {
    if (part.id === lead.id || part.state === "archived") continue;
    if (!classes.some((row) => row.id === part.classId)) continue;
    if (await changeRefusal(context, part.classId)) continue;
    const saved = await updateAssignment(tx, {
      tenantId,
      id: part.id,
      expectedVersion: part.version,
      classRow: { id: part.classId },
      ...sharedFields(lead),
      audience: part.audience,
      categoryId: part.categoryId,
    });
    if (!saved) continue;
    await partsFollow(context, {
      lead,
      part: { ...part, ...sharedFields(lead), version: saved.version },
    });
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
    if (await changeRefusal(context, row.id)) continue;
    const { audience } = await audienceIn(context, moduleId, row.id);
    const created = await insertAssignment(tx, {
      tenantId,
      orgId: context.schoolId,
      classRow: { id: row.id },
      authorUserId: lead.authorUserId,
      ...sharedFields(lead),
      audience,
      categoryId: null,
    });
    await placeDiscussion(tx, {
      tenantId,
      assignmentId: created.id,
      classId: row.id,
      moduleId,
      group,
    });
    const made = await assignmentById(tx, tenantId, created.id);
    if (made) await partsFollow(context, { lead, part: made });
    const documentId = await copyWords(context, lead, created.id);
    if (published)
      await publishPart(
        context,
        {
          ...lead,
          id: created.id,
          version: created.version,
          classId: row.id,
          state: "draft",
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
async function spreadModuleDiscussions(
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
    if (lead) await spreadDiscussion(context, lead, { moduleId, group });
  }
}

const moduleValue = v.union([v.literal(""), v.pipe(v.string(), v.uuid())]);

/** A part's module as the editor sends it: a module's id, or empty for none. */
function moduleOfValue(value: unknown): string {
  const parsed = v.safeParse(moduleValue, value);
  if (!parsed.success)
    throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
  return parsed.output;
}

async function placementOf(context: UnitContext, assignmentId: string) {
  return (
    (
      await placementsOf(context.tx, {
        tenantId: context.tenantId,
        assignmentIds: [assignmentId],
      })
    ).get(assignmentId) ?? null
  );
}

/**
 * The discussions a module holds, for whoever reads the module: those who
 * teach any of their classes see each with its class, a student those set
 * for them and open, a family those of the child they follow.
 */
async function discussionsOf(
  context: UnitContext,
  input: { moduleId: string; studentId: string },
): Promise<ModuleDiscussion[]> {
  const all = (
    await moduleDiscussions(context.tx, {
      tenantId: context.tenantId,
      moduleId: input.moduleId,
    })
  ).filter((assignment) => assignment.orgId === context.schoolId);
  if (can(context, "submissions:grade")) {
    const rows: ModuleDiscussion[] = [];
    for (const assignment of all) {
      if (!(await teaches(context, "teaching", assignment.classId))) continue;
      const classRow = await classById(context.tx, context, assignment.classId);
      rows.push({
        id: assignment.id,
        title: assignment.title,
        dueAt: assignment.dueAt,
        state: assignment.state,
        class: classRow && {
          id: classRow.id,
          code: classRow.code,
          titleEn: classRow.titleEn,
          titleAr: classRow.titleAr,
        },
      });
    }
    return rows;
  }
  const studentId = input.studentId || context.actor.userId;
  if (studentId === context.actor.userId)
    requireCapability(context, "own-work:read");
  else {
    requireCapability(context, "children:read");
    await requireStudent(context, "teaching", studentId);
  }
  const rows: ModuleDiscussion[] = [];
  for (const assignment of all) {
    const recipient =
      assignment.state === "published"
        ? await isRecipient(
            context.tx,
            context.tenantId,
            assignment.id,
            studentId,
          )
        : null;
    if (!recipient) continue;
    const own = ownSchedule(assignment, recipient);
    if (
      own.assignment.availableFrom &&
      Date.parse(own.assignment.availableFrom) > context.now.getTime()
    )
      continue;
    rows.push({
      id: assignment.id,
      title: assignment.title,
      dueAt: own.dueAt,
      state: assignment.state,
      class: null,
    });
  }
  return rows;
}

/**
 * A discussion's place in a module, where e-learning and coursework are
 * both on: the module part of the assignment editor, the discussion spread
 * across the module's classes, and the discussions a module shows.
 */
export const ELEARNING_WITH_COURSEWORK: ModuleContributions = {
  module: "elearning",
  needs: ["coursework"],
  contributions: [
    contribute(assignmentParts, {
      key: "module",
      prepare: async (context, input) => {
        const placed = input.stored
          ? await placementOf(context, input.stored.id)
          : null;
        const moduleId =
          input.value === undefined ? "" : moduleOfValue(input.value);
        if (placed && input.stored) {
          // A class's part of a module discussion stays that class's, in its module.
          if (input.stored.classId !== input.classId)
            throw new ORPCError("BAD_REQUEST", {
              message: "coursework.class_fixed",
            });
          if (moduleId !== placed.moduleId)
            throw new ORPCError("CONFLICT", {
              message: "coursework.module_fixed",
            });
        }
        if (!moduleId) return null;
        const found = await moduleById(context.tx, context.tenantId, moduleId);
        if (
          input.format !== "discussion" ||
          !found ||
          found.orgId !== context.schoolId ||
          !(await mayEditModule(context, found)) ||
          !(await classesOfModule(context.tx, context.tenantId, found.id)).some(
            (row) => row.id === input.classId,
          )
        )
          throw new ORPCError("BAD_REQUEST", {
            message: "coursework.module_unknown",
          });
        // Who takes part in each class is who the module reaches there.
        return audienceIn(context, found.id, input.classId);
      },
      save: async (context, input) => {
        const moduleId = moduleOfValue(input.value);
        if (!moduleId) return;
        // One discussion across the module's classes: this part leads, the
        // others take its words and settings, and classes without one get one.
        let placement = await placementOf(context, input.assignment.id);
        if (!placement) {
          placement = { moduleId, group: input.assignment.id };
          await placeDiscussion(context.tx, {
            tenantId: context.tenantId,
            assignmentId: input.assignment.id,
            classId: input.assignment.classId,
            ...placement,
          });
        }
        await spreadDiscussion(context, input.assignment, placement);
      },
      // A module discussion goes out to every class of the module at once.
      published: async (context, assignment) => {
        const placement = await placementOf(context, assignment.id);
        if (placement) await spreadDiscussion(context, assignment, placement);
      },
      // The module stays only where it is set for the new class too.
      reused: async (context, input) => {
        const placement = await placementOf(context, input.source.id);
        if (
          placement &&
          (
            await classesOfModule(
              context.tx,
              context.tenantId,
              placement.moduleId,
            )
          ).some((row) => row.id === input.created.classId)
        )
          await placeDiscussion(context.tx, {
            tenantId: context.tenantId,
            assignmentId: input.created.id,
            classId: input.created.classId,
            moduleId: placement.moduleId,
            group: input.created.id,
          });
      },
    }),
    contribute(moduleParts, {
      classesChanged: spreadModuleDiscussions,
      discussionsOf,
      placementOf: async (context, assignmentId) => {
        const assignment = await taughtAssignment(context, assignmentId);
        return (await placementOf(context, assignment.id))?.moduleId ?? null;
      },
    }),
  ],
};
