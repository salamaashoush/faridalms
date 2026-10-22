import type { ModuleRow } from "@faridalms/database/stores/learning";

import { teachesClass } from "@faridalms/database/stores/classes";
import {
  classesOfModule,
  moduleById,
} from "@faridalms/database/stores/learning";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

import { scopeOf } from "./coursework-access";
import { can } from "./procedure";

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
    if (await teachesClass(context.tx, scopeOf(context), item.id)) return true;
  return false;
}

export async function editableModule(context: UnitContext, moduleId: string) {
  const row = await moduleOfSchool(context, moduleId);
  if (!(await mayEditModule(context, row))) throw new ORPCError("NOT_FOUND");
  return row;
}
