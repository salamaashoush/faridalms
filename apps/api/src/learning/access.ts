import type { ModuleRow } from "@faridalms/database/stores/learning";

import { machineTranslationUnchecked } from "@faridalms/database/stores/assistant";
import {
  classesOfModule,
  lessonTranslationReviewedAt,
  moduleById,
} from "@faridalms/database/stores/learning";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { can } from "../core/procedure";
import { teaches } from "../core/reach";

/** A module of the viewer's school, or not found. */
export async function moduleOfSchool(context: UnitContext, moduleId: string) {
  const row = await moduleById(context.tx, context.tenantId, moduleId);
  if (!row || row.orgId !== context.schoolId) throw new ORPCError("NOT_FOUND");
  return row;
}

/** Whether the viewer may change a module: its author, or a teacher of one of its classes. */
export async function mayEditModule(context: UnitContext, row: ModuleRow) {
  if (!can(context, "learning:author")) return false;
  if (row.authorUserId === context.actor.userId) return true;
  if (can(context, "classes:manage")) return true;
  const classes = await classesOfModule(context.tx, context.tenantId, row.id);
  for (const item of classes)
    if (await teaches(context, "teaching", item.id)) return true;
  return false;
}

export async function editableModule(context: UnitContext, moduleId: string) {
  const row = await moduleOfSchool(context, moduleId);
  if (!(await mayEditModule(context, row))) throw new ORPCError("NOT_FOUND");
  return row;
}

/** Whether the model drafted the lesson's translation since a person last checked it. */
export async function translationUnchecked(context: UnitContext, id: string) {
  return machineTranslationUnchecked(context.tx, {
    tenantId: context.tenantId,
    host: "lesson",
    id,
    reviewedAt: await lessonTranslationReviewedAt(
      context.tx,
      context.tenantId,
      id,
    ),
  });
}
