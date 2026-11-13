import {
  classById,
  groupsOf,
  removeGroup as removeGroupRow,
  rosterOf,
  saveGroup as saveGroupRow,
} from "@faridalms/database/stores/classes";
import { namesOf } from "@faridalms/database/stores/persons";
import { saveGroupSchema } from "@faridalms/domain/classes";
import { dayWithin } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { contributionsTo } from "../core/extension";
import {
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { keepsGroups } from "./group-access";
import { classJoins } from "./points";

const id = v.pipe(v.string(), v.uuid());

/**
 * A class whose groups the viewer keeps, with its roster on the day, or
 * not found.
 */
async function taughtClass(context: UnitContext, classId: string) {
  requireCapability(context, "assignments:author");
  const classRow = await classById(context.tx, context, classId);
  if (!classRow || !(await keepsGroups(context, classRow.id)))
    throw new ORPCError("NOT_FOUND");
  const roster = await rosterOf(
    context.tx,
    context.tenantId,
    classRow.id,
    dayWithin(classRow.runs, context.today),
  );
  return { classRow, roster: new Set<string>(roster) };
}

/**
 * A class's groups and roster, for choosing who gets work. A group's
 * members are those of it on the roster, so a student who leaves the class
 * leaves its groups the same day, however they left.
 */
export const groups = readProcedure
  .input(v.object({ classId: id }))
  .handler(async ({ input, context }) => {
    const { classRow, roster } = await taughtClass(context, input.classId);
    const [kept, names] = await Promise.all([
      groupsOf(context.tx, context.tenantId, classRow.id),
      namesOf(context.tx, context.tenantId, [...roster]),
    ]);
    return {
      groups: kept.map((group) => ({
        ...group,
        studentIds: group.studentIds.filter((studentId) =>
          roster.has(studentId),
        ),
      })),
      roster: names,
    };
  });

/** Adds a group of the class's students, or renames one and changes who is in it. */
export const saveGroup = writeProcedure
  .input(saveGroupSchema)
  .handler(async ({ input, context }) => {
    if (!input.titleEn && !input.titleAr)
      throw new ORPCError("BAD_REQUEST", {
        message: "validation.name_required",
      });
    const { classRow, roster } = await taughtClass(context, input.classId);
    if (
      input.studentIds.some((studentId) => !roster.has(studentId)) ||
      (input.id &&
        !(await groupsOf(context.tx, context.tenantId, classRow.id)).some(
          (group) => group.id === input.id,
        ))
    )
      throw new ORPCError("NOT_FOUND");
    const groupId = await saveGroupRow(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: input.id,
      classId: classRow.id,
      titleEn: input.titleEn || null,
      titleAr: input.titleAr || null,
      studentIds: input.studentIds,
      userId: context.actor.userId,
    });
    for (const joins of await contributionsTo(context, classJoins))
      await joins.joinedGroup?.(context, {
        classId: classRow.id,
        groupId,
        studentIds: input.studentIds,
      });
    return { id: groupId };
  });

export const removeGroup = writeProcedure
  .input(v.object({ id, classId: id }))
  .handler(async ({ input, context }) => {
    const { classRow } = await taughtClass(context, input.classId);
    const known = await groupsOf(context.tx, context.tenantId, classRow.id);
    if (!known.some((row) => row.id === input.id))
      throw new ORPCError("NOT_FOUND");
    await removeGroupRow(context.tx, context.tenantId, input.id);
    return { removed: true };
  });
