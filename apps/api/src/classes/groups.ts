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

import { contributionsTo } from "../core/extension";
import {
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { requireTaught, teaches } from "../core/reach";
import { classJoins } from "./points";

const id = v.pipe(v.string(), v.uuid());

/** A class's groups and roster, for choosing who gets work. */
export const groups = readProcedure
  .input(v.object({ classId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const classRow = await classById(context.tx, context, input.classId);
    if (!classRow || !(await teaches(context, "teaching", classRow.id)))
      throw new ORPCError("NOT_FOUND");
    const roster = await rosterOf(
      context.tx,
      context.tenantId,
      classRow.id,
      dayWithin(classRow.runs, context.today),
    );
    const names = await namesOf(context.tx, context.tenantId, roster);
    return {
      groups: await groupsOf(context.tx, context.tenantId, classRow.id),
      roster: names,
    };
  });

export const saveGroup = writeProcedure
  .input(saveGroupSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    if (!input.titleEn && !input.titleAr)
      throw new ORPCError("BAD_REQUEST", {
        message: "validation.name_required",
      });
    const classRow = await classById(context.tx, context, input.classId);
    if (!classRow || !(await teaches(context, "teaching", classRow.id)))
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
    requireCapability(context, "assignments:author");
    await requireTaught(context, "teaching", input.classId);
    const known = await groupsOf(context.tx, context.tenantId, input.classId);
    if (!known.some((row) => row.id === input.id))
      throw new ORPCError("NOT_FOUND");
    await removeGroupRow(context.tx, context.tenantId, input.id);
    return { removed: true };
  });
