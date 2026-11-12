import {
  classById,
  groupsOf,
  rosterOf,
} from "@faridalms/database/stores/classes";
import { namesOf } from "@faridalms/database/stores/persons";
import { dayWithin } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import { readProcedure, requireCapability } from "../core/procedure";
import { teaches } from "../core/reach";

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
